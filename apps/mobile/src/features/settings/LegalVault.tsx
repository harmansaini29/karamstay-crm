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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError, resolveStorageUrl } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../../components/Badge';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export const DOC_TYPE_OPTIONS = [
  {
    label: 'Aadhaar Card',
    value: 'aadhaar',
    icon: 'card-outline' as const,
    description: 'Government photo identification proof',
  },
  {
    label: 'Police NOC / Verification',
    value: 'police_noc',
    icon: 'shield-checkmark-outline' as const,
    description: 'Police verification clearance certificate',
  },
  {
    label: 'Stamp Paper',
    value: 'stamp_paper',
    icon: 'newspaper-outline' as const,
    description: 'E-stamp / physical legal stamp paper',
  },
  {
    label: 'Tenant Photo',
    value: 'tenant_photo',
    icon: 'person-outline' as const,
    description: 'Passport-size or profile photograph',
  },
  {
    label: 'Lease Agreement',
    value: 'lease_agreement',
    icon: 'document-text-outline' as const,
    description: 'Signed tenancy rental agreement (.pdf / .docx)',
  },
  {
    label: 'Other Document',
    value: 'other',
    icon: 'folder-outline' as const,
    description: 'Any other legal certificate or document',
  },
] as const;

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
  const { contentBottomPadding, horizontalGutter } = useResponsiveLayout();
  const queryClient = useQueryClient();

  const isOwner = user?.role?.name === 'owner';
  const isManager = user?.role?.name === 'manager';
  const isStaff = user?.role?.name === 'staff';
  const isAuthorizedUploader = isOwner || isManager || isStaff;
  const isOwnerManager = isOwner || isManager;
  const canVerifyDoc = isOwner || isManager || isStaff;

  const [isUploading, setIsUploading] = useState(false);
  const isPickingRef = useRef(false); // mutex: prevents concurrent picker sessions
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [tenantPickerVisible, setTenantPickerVisible] = useState(false);
  const [docTypePickerVisible, setDocTypePickerVisible] = useState(false);
  const [sourcePickerVisible, setSourcePickerVisible] = useState(false);
  const [selectedTenantForUpload, setSelectedTenantForUpload] = useState<{ id: number; name: string } | null>(null);
  const [stagedDocType, setStagedDocType] = useState<string>('lease_agreement');

  // Staged document preview & discard before S3 upload
  const [stagedAsset, setStagedAsset] = useState<any>(null);
  const [stagedTenantId, setStagedTenantId] = useState<number | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  // Tenants list — the uploader must choose which tenant a document belongs to
  const { data: tenants = [] } = useQuery<{ id: number; name: string; phone: string }[]>({
    queryKey: ['tenants'],
    enabled: isAuthorizedUploader,
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
      let downloadUrl = resolveStorageUrl(downloadRes.data?.download_url);
      if (!downloadUrl) {
        const baseURL = apiClient.defaults.baseURL || '';
        downloadUrl = `${baseURL}/documents/${id}/file`;
      }
      await WebBrowser.openBrowserAsync(downloadUrl);
    } catch (err: any) {
      Alert.alert('Download Failed', parseApiError(err).message || 'Unable to open file link');
    }
  };

  const handleCameraCapture = async () => {
    if (isPickingRef.current || isUploading) return;
    isPickingRef.current = true;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Camera access is needed to capture photos of legal documents.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
        base64: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0];
      const fileName = asset.fileName || `${stagedDocType}_${Date.now()}.jpg`;
      setStagedAsset({
        uri: asset.uri,
        name: fileName,
        mimeType: asset.mimeType || 'image/jpeg',
        base64: asset.base64,
        width: asset.width,
        height: asset.height,
      });
      setStagedTenantId(selectedTenantForUpload?.id || null);
      setSourcePickerVisible(false);
      setPreviewModalVisible(true);
    } catch (pickerErr: any) {
      Alert.alert('Camera Error', pickerErr?.message || 'Could not open camera.');
    } finally {
      isPickingRef.current = false;
    }
  };

  const handleGalleryPick = async () => {
    if (isPickingRef.current || isUploading) return;
    isPickingRef.current = true;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Gallery access is needed to select documents.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
        base64: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0];
      const fileName = asset.fileName || `${stagedDocType}_${Date.now()}.jpg`;
      setStagedAsset({
        uri: asset.uri,
        name: fileName,
        mimeType: asset.mimeType || 'image/jpeg',
        base64: asset.base64,
        width: asset.width,
        height: asset.height,
      });
      setStagedTenantId(selectedTenantForUpload?.id || null);
      setSourcePickerVisible(false);
      setPreviewModalVisible(true);
    } catch (pickerErr: any) {
      Alert.alert('Gallery Error', pickerErr?.message || 'Could not open photo gallery.');
    } finally {
      isPickingRef.current = false;
    }
  };

  const handleFilePick = async () => {
    if (isPickingRef.current || isUploading) return;
    isPickingRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0];
      const fileName = asset.name || `${stagedDocType}_${Date.now()}.pdf`;
      setStagedAsset({
        uri: asset.uri,
        name: fileName,
        mimeType: asset.mimeType || 'application/octet-stream',
        size: asset.size,
      });
      setStagedTenantId(selectedTenantForUpload?.id || null);
      setSourcePickerVisible(false);
      setPreviewModalVisible(true);
    } catch (pickerErr: any) {
      Alert.alert('Picker Error', pickerErr?.message || 'Could not open document picker.');
    } finally {
      isPickingRef.current = false;
    }
  };

  const handleDiscardStaged = () => {
    setStagedAsset(null);
    setStagedTenantId(null);
    setSelectedTenantForUpload(null);
    setPreviewModalVisible(false);
  };

  const handleConfirmUpload = async () => {
    if (!stagedAsset || !stagedTenantId) return;
    setIsUploading(true);
    const asset = stagedAsset;
    const tenantId = stagedTenantId;
    const docType = stagedDocType || 'other';
    try {
      let fileName = asset.name || asset.fileName || `${docType}_${Date.now()}.pdf`;
      let contentType = asset.mimeType || 'application/octet-stream';
      if (contentType === 'application/octet-stream') {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.pdf')) contentType = 'application/pdf';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (lower.endsWith('.png')) contentType = 'image/png';
        else if (lower.endsWith('.webp')) contentType = 'image/webp';
        else if (lower.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (!fileName.includes('.')) {
        if (contentType.includes('pdf')) fileName += '.pdf';
        else if (contentType.includes('png')) fileName += '.png';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) fileName += '.jpg';
        else fileName += '.pdf';
      }

      // 1. Read file as base64 to ensure resilient direct-upload fallback
      let base64Content: string | null = asset.base64 || null;
      if (!base64Content && asset.uri) {
        try {
          base64Content = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
          });
        } catch {
          try {
            const resp = await fetch(asset.uri);
            const blob = await resp.blob();
            base64Content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const res = reader.result as string;
                const b64 = res.includes(',') ? res.split(',')[1] : res;
                resolve(b64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch {
            // If local file reading fails, continue to attempt presigned upload
          }
        }
      }

      // 2. Request presigned upload URL from backend for the chosen tenant
      let presignRes: any = null;
      try {
        presignRes = await apiClient.post('/documents/presign-upload', {
          document_type: docType,
          file_name: fileName,
          content_type: contentType,
          tenant_id: tenantId,
        });
      } catch {
        // Backend presign failed; fall through to direct upload if base64 is available
      }

      let uploadUrl = presignRes?.data?.upload_url;
      const fileKey = presignRes?.data?.file_key;
      let uploadSuccess = false;

      if (uploadUrl) {
        uploadUrl = resolveStorageUrl(uploadUrl);
      }

      const isInternalMock = uploadUrl && (
        uploadUrl.includes('s3.local.karamstay.internal') ||
        uploadUrl.includes('mock-presigned-url')
      );

      if (uploadUrl && !isInternalMock) {
        // Prefer native upload via expo-file-system if available
        try {
          if (FileSystem.uploadAsync) {
            const fsRes = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
              httpMethod: 'PUT',
              uploadType:
                (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT ??
                (FileSystem as any).UploadType?.BINARY_CONTENT ??
                0,
              headers: { 'Content-Type': contentType },
            });
            if (fsRes.status >= 200 && fsRes.status < 300) {
              uploadSuccess = true;
            }
          }
        } catch {
          // Native upload failed, try fetch fallback
        }

        if (!uploadSuccess) {
          try {
            const fileRes = await fetch(asset.uri);
            const fileBlob = await fileRes.blob();
            const putRes = await fetch(uploadUrl, {
              method: 'PUT',
              body: fileBlob,
              headers: {
                'Content-Type': contentType,
              },
            });
            if (putRes.ok) {
              uploadSuccess = true;
            }
          } catch {
            // S3 fetch upload failed
          }
        }
      }

      // 3. Confirm with backend metadata service:
      // If S3 upload succeeded, supply file_key.
      // Otherwise, fall back cleanly to direct base64 upload!
      if (uploadSuccess && fileKey) {
        await apiClient.post('/documents', {
          document_type: docType,
          file_key: fileKey,
          file_name: fileName,
          content_type: contentType,
          tenant_id: tenantId,
        });
      } else if (base64Content) {
        await apiClient.post('/documents', {
          document_type: docType,
          file_name: fileName,
          content_type: contentType,
          tenant_id: tenantId,
          file_base64: base64Content,
        });
      } else {
        throw new Error('Failed to upload file to S3 or backend.');
      }

      // Invalidate document list + agreement pipeline
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-agreements'] });
      setPreviewModalVisible(false);
      setStagedAsset(null);
      setStagedTenantId(null);
      setSelectedTenantForUpload(null);
      Alert.alert('Success', 'Legal document uploaded to vault successfully.');
    } catch (err: any) {
      Alert.alert('Upload Failed', parseApiError(err).message || err.message || 'Unable to complete upload');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = () => {
    if (!selectedDoc) return;
    Alert.alert(
      'Delete Document',
      `Are you sure you want to permanently delete "${selectedDoc.file_name}" from the Legal Vault and cloud storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingDoc(true);
            try {
              await apiClient.delete(`/documents/${selectedDoc.id}`);
              queryClient.invalidateQueries({ queryKey: ['documents'] });
              queryClient.invalidateQueries({ queryKey: ['agreements'] });
              queryClient.invalidateQueries({ queryKey: ['tenant-agreements'] });
              setOptionsModalVisible(false);
              Alert.alert('Document Deleted', 'The document has been permanently removed.');
            } catch (err: any) {
              Alert.alert('Delete Failed', parseApiError(err).message);
            } finally {
              setIsDeletingDoc(false);
            }
          },
        },
      ]
    );
  };

  const startUpload = () => {
    if (tenants.length === 0) {
      Alert.alert('No tenants', 'Add a tenant first before uploading a document for them.');
      return;
    }
    setTenantPickerVisible(true);
  };

  const onPickTenant = (tenant: { id: number; name: string }) => {
    setSelectedTenantForUpload(tenant);
    setTenantPickerVisible(false);
    setDocTypePickerVisible(true);
  };

  const onSelectDocType = (docType: string) => {
    setStagedDocType(docType);
    setDocTypePickerVisible(false);
    setSourcePickerVisible(true);
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

  const renderDocumentItem = ({ item }: { item: DocumentItem }) => {
    const isWordDoc = item.file_name.toLowerCase().endsWith('.docx') || item.file_name.toLowerCase().endsWith('.doc');
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => handleCardPress(item)}>
        <Card style={[styles.card, { borderColor: colors.border }]}>
          <View style={styles.cardRow}>
            <View style={[styles.iconCircle, { backgroundColor: isWordDoc ? '#2563EB18' : colors.primary + '15' }]}>
              <Ionicons
                name={isWordDoc ? "document-text" : "document-text-outline"}
                size={24}
                color={isWordDoc ? "#2563EB" : colors.primary}
              />
            </View>
            <View style={{ flex: 1, marginRight: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, flex: 1 }} numberOfLines={1}>
                  {item.file_name}
                </Text>
                {isWordDoc ? (
                  <View style={[styles.wordBadge, { backgroundColor: '#2563EB15', borderColor: '#2563EB40' }]}>
                    <Text style={{ color: '#2563EB', fontSize: 10, fontWeight: '700' }}>DOCX</Text>
                  </View>
                ) : null}
              </View>
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
  };

  const handleBack = () => navigation.goBack();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Legal Vault
        </Text>
        {isAuthorizedUploader ? (
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
                  onPress={() => onPickTenant(t)}
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

      {/* Dynamic Document Type Picker Modal */}
      <Modal
        visible={docTypePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDocTypePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
                  Document Category
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                  For {selectedTenantForUpload?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDocTypePickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={DOC_TYPE_OPTIONS}
              keyExtractor={(opt) => opt.value}
              style={{ maxHeight: 340 }}
              renderItem={({ item: opt }) => (
                <TouchableOpacity
                  onPress={() => onSelectDocType(opt.value)}
                  style={styles.docTypeOptionRow}
                >
                  <View style={[styles.iconCircleSmall, { backgroundColor: colors.primary + '15', marginRight: 12 }]}>
                    <Ionicons name={opt.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: font.body.fontSize, fontWeight: '600' }}>
                      {opt.label}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 1 }}>
                      {opt.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />
          </Card>
        </View>
      </Modal>

      {/* Multi-Source Picker Modal (Camera, Gallery, Files) */}
      <Modal
        visible={sourcePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSourcePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
                  Select Upload Source
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                  {DOC_TYPE_OPTIONS.find((o) => o.value === stagedDocType)?.label} · {selectedTenantForUpload?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSourcePickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCameraCapture}
              style={[styles.sourceOptionRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <View style={[styles.iconCircleSmall, { backgroundColor: '#10B98118' }]}>
                <Ionicons name="camera-outline" size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.body.fontSize }}>
                  Click Photo (Camera)
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 1 }}>
                  Snap document directly with phone camera
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleGalleryPick}
              style={[styles.sourceOptionRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <View style={[styles.iconCircleSmall, { backgroundColor: '#3B82F618' }]}>
                <Ionicons name="images-outline" size={22} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.body.fontSize }}>
                  Photo Gallery
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 1 }}>
                  Pick existing photo from your gallery
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleFilePick}
              style={[styles.sourceOptionRow, { borderColor: colors.border, backgroundColor: colors.surface, marginBottom: space.sm }]}
            >
              <View style={[styles.iconCircleSmall, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="document-attach-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.body.fontSize }}>
                  Files & Documents (PDF / Word)
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 1 }}>
                  Browse device files for .pdf or .docx contracts
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>
      </Modal>

      <FlatList
        data={documents}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderDocumentItem}
        contentContainerStyle={{ paddingHorizontal: horizontalGutter, paddingBottom: contentBottomPadding }}
        ListEmptyComponent={
          <EmptyState
            title="Empty Legal Vault"
            body="Documents like signed rental contracts and payment receipts will show up here."
            ctaLabel={isAuthorizedUploader ? 'Upload Document' : undefined}
            onPress={isAuthorizedUploader ? startUpload : undefined}
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
              label={
                selectedDoc?.file_name.toLowerCase().endsWith('.docx')
                  ? 'Download Word Document (.docx)'
                  : 'View / Download Document File'
              }
              onPress={() => selectedDoc && handleDownload(selectedDoc.id)}
              variant="secondary"
              style={{ marginBottom: space.sm }}
            />

            {selectedDoc?.status === 'pending' && canVerifyDoc ? (
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

            {isOwner ? (
              <Button
                label={isDeletingDoc ? "Deleting..." : "Delete Document"}
                onPress={handleDeleteDocument}
                variant="destructive"
                disabled={isDeletingDoc}
                style={{ marginTop: space.sm }}
              />
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

      {/* Staged Document Preview & Discard Modal */}
      <Modal
        visible={previewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleDiscardStaged}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
                  Preview Upload
                </Text>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.caption.fontSize, marginTop: 2 }}>
                  {DOC_TYPE_OPTIONS.find((o) => o.value === stagedDocType)?.label} · {selectedTenantForUpload?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={handleDiscardStaged}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {stagedAsset && (stagedAsset.mimeType?.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(stagedAsset.name)) ? (
              <Image
                source={{ uri: stagedAsset.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.nonImagePreview, { backgroundColor: colors.bg }]}>
                <Ionicons name="document-text-outline" size={48} color={colors.primary} />
                <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }} numberOfLines={1}>
                  {stagedAsset?.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {stagedAsset?.mimeType || 'Document'}
                </Text>
              </View>
            )}

            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginVertical: space.sm }}>
              Review the selected file. If the photo or document is blurry or incorrect, tap Discard to cancel.
            </Text>

            <View style={styles.modalButtons}>
              <Button
                label="Discard"
                onPress={handleDiscardStaged}
                variant="destructive"
                style={{ flex: 1, marginRight: space.sm }}
              />
              <Button
                label={isUploading ? 'Uploading...' : 'Confirm & Upload'}
                onPress={handleConfirmUpload}
                disabled={isUploading}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      </ResponsiveContainer>
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
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  nonImagePreview: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 8,
    marginBottom: 12,
  },
  iconCircleSmall: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  docTypeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB25',
  },
  sourceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
});
