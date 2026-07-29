import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../../components/Badge';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';

interface DocumentItem {
  id: number;
  tenant_id: number | null;
  property_id: number | null;
  document_type: string;
  file_name: string;
  content_type: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
}

export const LegalVault: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwnerManager = user?.role?.name === 'owner' || user?.role?.name === 'manager';

  const [isUploading, setIsUploading] = useState(false);
  const isPickingRef = useRef(false); // mutex: prevents concurrent picker sessions
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [tenantPickerVisible, setTenantPickerVisible] = useState(false);

  // Tenants list — the uploader must choose which tenant a document belongs to
  // (the old code hardcoded tenant_id: 1, attaching every upload to one tenant).
  const { data: tenants = [] } = useQuery<{ id: number; name: string; phone: string }[]>({
    queryKey: ['tenants'],
    enabled: isOwnerManager,
    queryFn: async () => {
      const res = await apiClient.get('/tenants');
      return res.data;
    },
  });

  // Queries
  const {
    data: documents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DocumentItem[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await apiClient.get('/documents');
      return res.data;
    },
  });

  const verifyDocMutation = useMutation({
    mutationFn: async (payload: { id: number; status: 'approved' | 'rejected'; rejection_reason?: string }) => {
      const { id, status, rejection_reason } = payload;
      const res = await apiClient.patch(`/documents/${id}/status`, { status, rejection_reason });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-agreements'] });
      setOptionsModalVisible(false);
      Alert.alert('Success', 'Document status updated successfully.');
    },
    onError: (err: any) => {
      Alert.alert('Verification Failed', parseApiError(err).message || 'Unable to update document status.');
    },
  });

  const handleDownload = async (id: number) => {
    try {
      const downloadRes = await apiClient.get(`/documents/${id}/download`);
      const { download_url } = downloadRes.data;
      if (download_url) {
        await WebBrowser.openBrowserAsync(download_url);
      } else {
        throw new Error('Download URL empty');
      }
    } catch (err: any) {
      Alert.alert('Download Failed', parseApiError(err).message || 'Unable to open file link');
    }
  };

  const handleUpload = async (tenantId: number) => {
    // Mutex guard: prevents double-tap or concurrent picker sessions
    if (isPickingRef.current || isUploading) return;
    isPickingRef.current = true;

    let asset: any = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return; // user cancelled — finally block resets the ref
      }
      asset = result.assets[0];
    } catch (pickerErr: any) {
      Alert.alert('Picker Error', pickerErr?.message || 'Could not open document picker.');
      return;
    } finally {
      // Always release the picking mutex, even on cancel/error
      isPickingRef.current = false;
    }

    if (!asset) return;
    setIsUploading(true);
    try {
      // 1. Request presigned upload URL from backend for the chosen tenant
      const presignRes = await apiClient.post('/documents/presign-upload', {
        document_type: 'lease_agreement',
        file_name: asset.name,
        content_type: asset.mimeType || 'application/octet-stream',
        tenant_id: tenantId,
      });

      const { upload_url, file_key } = presignRes.data;

      // 2. Put file to S3 using the presigned URL
      const fileRes = await fetch(asset.uri);
      const fileBlob = await fileRes.blob();

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: fileBlob,
        headers: {
          'Content-Type': asset.mimeType || 'application/octet-stream',
        },
      });

      if (!putRes.ok) {
        throw new Error('Failed to upload file bytes directly to S3');
      }

      // 3. Confirm upload with the backend metadata service
      await apiClient.post('/documents', {
        document_type: 'lease_agreement',
        file_key,
        file_name: asset.name,
        content_type: asset.mimeType || 'application/octet-stream',
        tenant_id: tenantId,
      });

      // Invalidate document list + agreement pipeline (AgreementWorkspace, TenantAgreementGate, owner view)
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-agreements'] });
      Alert.alert('Success', 'Legal document uploaded to vault successfully.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Unable to complete upload');
    } finally {
      setIsUploading(false);
    }
  };

  const startUpload = () => {
    if (tenants.length === 0) {
      Alert.alert('No tenants', 'Add a tenant first before uploading a document for them.');
      return;
    }
    setTenantPickerVisible(true);
  };

  const onPickTenant = (tenantId: number) => {
    setTenantPickerVisible(false);
    handleUpload(tenantId);
  };

  const handleCardPress = (item: DocumentItem) => {
    setSelectedDoc(item);
    setOptionsModalVisible(true);
  };

  const handleApprove = () => {
    if (selectedDoc) {
      verifyDocMutation.mutate({ id: selectedDoc.id, status: 'approved' });
    }
  };

  const handleRejectPress = () => {
    setRejectionReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection.');
      return;
    }
    if (selectedDoc) {
      verifyDocMutation.mutate({
        id: selectedDoc.id,
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
      });
      setRejectModalVisible(false);
    }
  };

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderDocumentItem = ({ item }: { item: DocumentItem }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={() => handleCardPress(item)}>
      <Card style={[styles.card, { borderColor: colors.border }]}>
        <View style={styles.cardRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="document-text" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginRight: space.sm }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }} numberOfLines={1}>
              {item.file_name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Type: {item.document_type.replace('_', ' ').toUpperCase()} · {new Date(item.created_at).toLocaleDateString()}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Badge status={item.status} />
              {item.status === 'rejected' && item.rejection_reason ? (
                <Text style={{ color: '#d32f2f', fontSize: 11, marginLeft: 8, fontWeight: 'bold' }} numberOfLines={1}>
                  Reason: {item.rejection_reason}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => handleDownload(item.id)}
            style={[styles.downloadBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="eye-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const handleBack = () => navigation.goBack();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Legal Vault
        </Text>
        {isOwnerManager ? (
          <TouchableOpacity onPress={startUpload} disabled={isUploading}>
            <Text style={{ color: colors.primary, fontSize: font.body.fontSize, fontWeight: '600' }}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Tenant picker — choose who the uploaded document belongs to */}
      <Modal
        visible={tenantPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTenantPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
                Upload document for…
              </Text>
              <TouchableOpacity onPress={() => setTenantPickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={tenants}
              keyExtractor={(t) => String(t.id)}
              style={{ maxHeight: 320 }}
              renderItem={({ item: t }) => (
                <TouchableOpacity
                  onPress={() => onPickTenant(t.id)}
                  style={{
                    paddingVertical: space.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: font.body.fontSize, fontWeight: '500' }}>
                    {t.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>{t.phone}</Text>
                </TouchableOpacity>
              )}
            />
          </Card>
        </View>
      </Modal>

      <FlatList
        data={documents}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderDocumentItem}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="Empty Legal Vault"
            body="Documents like signed rental contracts and payment receipts will show up here."
          />
        }
        refreshing={isLoading}
        onRefresh={refetch}
      />

      {/* Document Options Modal */}
      <Modal
        visible={optionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }} numberOfLines={1}>
                {selectedDoc?.file_name}
              </Text>
              <TouchableOpacity onPress={() => setOptionsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.md }}>
              Type: {selectedDoc?.document_type.replace('_', ' ').toUpperCase()}{"\n"}
              Uploaded on: {selectedDoc ? new Date(selectedDoc.created_at).toLocaleDateString() : ''}{"\n"}
              Status: {selectedDoc?.status.toUpperCase()}
            </Text>

            <Button
              label="View Document File"
              onPress={() => selectedDoc && handleDownload(selectedDoc.id)}
              variant="secondary"
              style={{ marginBottom: space.sm }}
            />

            {selectedDoc?.status === 'pending' && isOwnerManager ? (
              <View style={styles.modalButtons}>
                <Button
                  label="Reject"
                  onPress={handleRejectPress}
                  variant="destructive"
                  style={{ flex: 1, marginRight: space.sm }}
                />
                <Button
                  label="Approve"
                  onPress={handleApprove}
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}
          </Card>
        </View>
      </Modal>

      {/* Rejection Feedback Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: space.xs }}>
              Reject Document
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.md }}>
              Provide feedback detailing why this document was rejected (e.g. "Signature missing", "Unreadable photo").
            </Text>

            <TextInput
              style={[styles.reasonInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Enter rejection reason..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />

            <View style={styles.modalButtons}>
              <Button
                label="Cancel"
                onPress={() => setRejectModalVisible(false)}
                variant="secondary"
                style={{ flex: 1, marginRight: space.sm }}
              />
              <Button
                label="Confirm Reject"
                onPress={handleConfirmReject}
                variant="destructive"
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  card: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  downloadBtn: {
    borderWidth: 1,
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: 16,
  },
});
