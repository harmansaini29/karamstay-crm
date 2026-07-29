/**
 * AgreementWorkspace.tsx
 *
 * Owner/Staff view for a specific tenant's legal agreement:
 *   • Tracker timeline (4 stages)
 *   • Tenant-submitted form data (read-only)
 *   • Compile / download .docx
 *   • Offline photo uploads (stamp paper, police NOC, notary stamp)
 *     with status tags (PENDING → STAMPED → NOTARIZED → APPROVED)
 *   • Final approval action
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { AgreementTrackerCard } from '../../components/AgreementTrackerCard';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agreement {
  id: number;
  tenancy_id: number;
  tenant_id: number;
  template_id: 'A' | 'B' | 'C';
  template_name: string;
  status: 'form_submitted' | 'docx_generated' | 'offline_pending' | 'approved';
  form_data: Record<string, string>;
  docx_file_name: string | null;
  docx_generated_at: string | null;
  tracker_stage: 1 | 2 | 3 | 4;
  created_at: string;
}

interface OfflineUpload {
  id: number;
  agreement_id: number;
  upload_type: 'stamp_paper' | 'police_noc' | 'notary_stamp';
  file_name: string;
  status: 'PENDING' | 'STAMPED' | 'NOTARIZED' | 'APPROVED';
  notes: string | null;
  uploaded_at: string;
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

const STAGES = [
  { n: 1, label: 'Form Submitted', icon: 'document-text-outline' },
  { n: 2, label: 'Docx Generated & Under Review', icon: 'cloud-download-outline' },
  { n: 3, label: 'Offline Stamp & Notary Verification', icon: 'stamper-outline' },
  { n: 4, label: 'Final Approval & Vault Archived', icon: 'checkmark-circle-outline' },
] as const;

const UPLOAD_TYPES: { type: OfflineUpload['upload_type']; label: string; icon: string }[] = [
  { type: 'stamp_paper', label: 'Stamp Paper', icon: 'receipt-outline' },
  { type: 'police_noc', label: 'Police NOC / Verification', icon: 'shield-checkmark-outline' },
  { type: 'notary_stamp', label: 'Notary / Registrar Stamp', icon: 'ribbon-outline' },
];

const UPLOAD_STATUS_COLORS: Record<string, string> = {
  PENDING: '#F59E0B',
  STAMPED: '#3B82F6',
  NOTARIZED: '#8B5CF6',
  APPROVED: '#10B981',
};

// ─── Component ───────────────────────────────────────────────────────────────

export const AgreementWorkspace: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { tenantId, tenantName } = route.params as { tenantId: number; tenantName: string };
  const { colors, font, space, radius } = useTheme();
  const qc = useQueryClient();

  const isPickingRef = useRef(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadType, setUploadType] = useState<OfflineUpload['upload_type']>('stamp_paper');
  const [statusModalUpload, setStatusModalUpload] = useState<OfflineUpload | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: agreements = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Agreement[]>({
    queryKey: ['agreements', 'tenant', tenantId],
    queryFn: async () => {
      const res = await apiClient.get(`/agreements?tenant_id=${tenantId}`);
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const agreement = agreements[0] ?? null;

  const { data: uploads = [], refetch: refetchUploads } = useQuery<OfflineUpload[]>({
    queryKey: ['agreement-uploads', agreement?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/agreements/${agreement!.id}/uploads`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!agreement?.id,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const compileMutation = useMutation({
    mutationFn: async (agId: number) => {
      const res = await apiClient.post(`/agreements/${agId}/compile-docx`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      Alert.alert('Success', 'Agreement document compiled and ready for download.');
    },
    onError: (err: any) => Alert.alert('Error', parseApiError(err).message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: {
      agId: number;
      upload_type: OfflineUpload['upload_type'];
      file_name: string;
    }) => {
      const res = await apiClient.post(`/agreements/${payload.agId}/offline-upload`, {
        upload_type: payload.upload_type,
        file_name: payload.file_name,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement-uploads', agreement?.id] });
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
    },
    onError: (err: any) => Alert.alert('Upload Error', parseApiError(err).message),
  });

  const updateUploadStatusMutation = useMutation({
    mutationFn: async (payload: { agId: number; uid: number; status: string }) => {
      const res = await apiClient.patch(
        `/agreements/${payload.agId}/uploads/${payload.uid}`,
        { status: payload.status }
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement-uploads', agreement?.id] });
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      setStatusModalUpload(null);
    },
    onError: (err: any) => Alert.alert('Error', parseApiError(err).message),
  });

  const approveMutation = useMutation({
    mutationFn: async (agId: number) => {
      const res = await apiClient.patch(`/agreements/${agId}`, {
        tracker_stage: 4,
        status: 'approved',
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      Alert.alert('Approved', 'Agreement fully approved and archived to Legal Vault.');
    },
    onError: (err: any) => Alert.alert('Error', parseApiError(err).message),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleOfflineUpload = async () => {
    if (!agreement) return;
    if (isPickingRef.current) return;
    isPickingRef.current = true;

    Alert.alert('Add Offline Document', 'Choose source', [
      {
        text: 'Camera',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission required', 'Camera access is needed to capture documents.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaType.Images,
              quality: 0.85,
              allowsEditing: true,
            });
            if (!result.canceled && result.assets?.length) {
              const fileName = result.assets[0].fileName ?? `${uploadType}_${Date.now()}.jpg`;
              uploadMutation.mutate({ agId: agreement.id, upload_type: uploadType, file_name: fileName });
            }
          } finally {
            isPickingRef.current = false;
            setUploadModalVisible(false);
          }
        },
      },
      {
        text: 'Document / Gallery',
        onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['image/*', 'application/pdf'],
              copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets?.length) {
              const fileName = result.assets[0].name ?? `${uploadType}_${Date.now()}`;
              uploadMutation.mutate({ agId: agreement.id, upload_type: uploadType, file_name: fileName });
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not open picker');
          } finally {
            isPickingRef.current = false;
            setUploadModalVisible(false);
          }
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          isPickingRef.current = false;
          setUploadModalVisible(false);
        },
      },
    ]);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderTracker = () => (
    <AgreementTrackerCard stage={agreement?.tracker_stage ?? 0} />
  );

  const renderFormData = () => {
    if (!agreement?.form_data || Object.keys(agreement.form_data).length === 0) return null;
    const entries = Object.entries(agreement.form_data).filter(([k]) => k !== 'digital_signature');
    return (
      <Card style={{ borderWidth: 1, marginBottom: space.md }}>
        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 12 }}>
          Submitted Agreement Data
        </Text>
        {entries.map(([key, value]) => (
          <View key={key} style={{ marginBottom: 10 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {key.replace(/_/g, ' ')}
            </Text>
            <Text style={{ color: colors.text, fontSize: font.body.fontSize, fontWeight: '500', marginTop: 2 }}>
              {/* Mask identity numbers — never display raw national IDs */}
              {key === 'identity_number'
                ? (value as string).replace(/\d(?=\d{4})/g, '*')
                : (value as string)}
            </Text>
          </View>
        ))}
        {agreement.form_data.digital_signature ? (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Digital Signature</Text>
            <View style={{ marginTop: 6, height: 48, borderRadius: 8, backgroundColor: colors.primary + '10', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '30' }}>
              <Ionicons name="pencil" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 11, marginTop: 2 }}>Signature on file</Text>
            </View>
          </View>
        ) : null}
      </Card>
    );
  };

  const renderDocxSection = () => (
    <Card style={{ borderWidth: 1, marginBottom: space.md }}>
      <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 12 }}>
        Agreement Document (.docx)
      </Text>
      {agreement?.docx_file_name ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: semanticColor.success.bg, padding: 10, borderRadius: 8, marginBottom: 12 }}>
            <Ionicons name="document-text" size={20} color={semanticColor.success.solid} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: semanticColor.success.fg, fontWeight: '700', fontSize: font.caption.fontSize }}>
                {agreement.docx_file_name}
              </Text>
              <Text style={{ color: semanticColor.success.fg, fontSize: 11, marginTop: 2 }}>
                Generated: {agreement.docx_generated_at ? new Date(agreement.docx_generated_at).toLocaleDateString() : '—'}
              </Text>
            </View>
          </View>
          <Button
            label="Download / View Document"
            variant="secondary"
            onPress={() =>
              WebBrowser.openBrowserAsync('https://s3.mock-presigned-url.com/download/agreement.docx')
            }
          />
        </View>
      ) : (
        <View>
          <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginBottom: 12 }}>
            The agreement document has not been compiled yet. Compile it from the tenant's submitted form data.
          </Text>
          <Button
            label="Compile Agreement (.docx)"
            loading={compileMutation.isPending}
            disabled={!agreement || agreement.tracker_stage < 1}
            onPress={() => agreement && compileMutation.mutate(agreement.id)}
          />
        </View>
      )}
    </Card>
  );

  const renderOfflineUploads = () => (
    <Card style={{ borderWidth: 1, marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
          Offline Verification Documents
        </Text>
        <TouchableOpacity
          onPress={() => setUploadModalVisible(true)}
          style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {uploads.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
          No offline documents uploaded yet. Add stamp paper photos, police verification, or notary stamps here.
        </Text>
      ) : (
        uploads.map((up) => (
          <TouchableOpacity key={up.id} onPress={() => setStatusModalUpload(up)} activeOpacity={0.75}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                <Ionicons
                  name={(UPLOAD_TYPES.find((t) => t.type === up.upload_type)?.icon ?? 'document-outline') as any}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.caption.fontSize }}>{up.file_name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {UPLOAD_TYPES.find((t) => t.type === up.upload_type)?.label} · {new Date(up.uploaded_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: (UPLOAD_STATUS_COLORS[up.status] || '#888') + '20' }}>
                <Text style={{ color: UPLOAD_STATUS_COLORS[up.status] || '#888', fontWeight: '700', fontSize: 11 }}>
                  {up.status}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>Legal Workspace</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          {/* Tenant name banner */}
          <View style={{ marginBottom: space.md, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="person-circle-outline" size={22} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>{tenantName}</Text>
            {agreement ? (
              <View style={{ marginLeft: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.primary + '15' }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>{agreement.template_name}</Text>
              </View>
            ) : null}
          </View>

          {!agreement ? (
            <Card style={{ borderWidth: 1, padding: space.xl, alignItems: 'center' }}>
              <Ionicons name="document-attach-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, textAlign: 'center' }}>
                No agreement has been initiated for this tenant yet. Create a tenancy first, then assign an agreement template from Check-In.
              </Text>
            </Card>
          ) : (
            <>
              {renderTracker()}
              {renderFormData()}
              {renderDocxSection()}
              {renderOfflineUploads()}

              {/* Final Approval */}
              {agreement.tracker_stage >= 3 && agreement.status !== 'approved' && (
                <Button
                  label="Grant Final Approval & Archive"
                  loading={approveMutation.isPending}
                  onPress={() => {
                    Alert.alert(
                      'Confirm Final Approval',
                      'This will mark the agreement as fully verified and archive it to the Legal Vault. This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Approve', onPress: () => approveMutation.mutate(agreement.id) },
                      ]
                    );
                  }}
                  style={{ marginBottom: space.lg }}
                />
              )}
              {agreement.status === 'approved' && (
                <View style={{ backgroundColor: semanticColor.success.bg, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: space.lg, borderWidth: 1, borderColor: semanticColor.success.solid + '30' }}>
                  <Ionicons name="checkmark-circle" size={28} color={semanticColor.success.solid} />
                  <Text style={{ color: semanticColor.success.fg, fontWeight: '700', marginTop: 6, fontSize: font.bodyStrong.fontSize }}>
                    Agreement Fully Approved & Archived
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Upload type picker modal */}
        <Modal visible={uploadModalVisible} transparent animationType="slide" onRequestClose={() => setUploadModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 16 }}>
                Select Document Type
              </Text>
              {UPLOAD_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.type}
                  onPress={() => {
                    setUploadType(t.type);
                    handleOfflineUpload();
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Ionicons name={t.icon as any} size={22} color={colors.primary} style={{ marginRight: 12 }} />
                  <Text style={{ color: colors.text, fontSize: font.body.fontSize, fontWeight: '600' }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setUploadModalVisible(false)} style={{ marginTop: 16, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: font.body.fontSize }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Upload status update modal */}
        {statusModalUpload && agreement && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setStatusModalUpload(null)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 8 }}>
                  Update Document Status
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: 16 }}>
                  {statusModalUpload.file_name}
                </Text>
                {(['PENDING', 'STAMPED', 'NOTARIZED', 'APPROVED'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => {
                      updateUploadStatusMutation.mutate({
                        agId: agreement.id,
                        uid: statusModalUpload.id,
                        status: s,
                      });
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: UPLOAD_STATUS_COLORS[s], marginRight: 12 }} />
                    <Text style={{ color: colors.text, fontSize: font.body.fontSize, fontWeight: statusModalUpload.status === s ? '700' : '400' }}>
                      {s} {statusModalUpload.status === s ? '(current)' : ''}
                    </Text>
                    {updateUploadStatusMutation.isPending && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setStatusModalUpload(null)} style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: font.body.fontSize }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
});
