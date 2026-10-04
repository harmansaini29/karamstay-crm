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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError, resolveStorageUrl } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { AgreementTrackerCard } from '../../components/AgreementTrackerCard';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agreement {
  id: number;
  tenancy_id: number;
  tenant_id: number;
  template_id: 'A' | 'B' | 'C';
  template_name: string;
  status: 'pending_tenant_fill' | 'form_submitted' | 'docx_generated' | 'offline_pending' | 'approved';
  form_data: Record<string, string>;
  docx_file_name: string | null;
  docx_generated_at: string | null;
  tenant_photo_key?: string | null;
  aadhar_card_key?: string | null;
  signature_key?: string | null;
  tenant_photo_url?: string | null;
  aadhar_card_url?: string | null;
  signature_url?: string | null;
  docx_download_url?: string | null;
  pdf_download_url?: string | null;
  s3_folder_path?: string | null;
  s3_archive_url?: string | null;
  tracker_stage: number;
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
  s3_key?: string | null;
  file_url?: string | null;
  download_url?: string | null;
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
  const { contentBottomPadding, horizontalGutter } = useResponsiveLayout();
  const qc = useQueryClient();

  const isPickingRef = useRef(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadType, setUploadType] = useState<OfflineUpload['upload_type']>('stamp_paper');
  const [statusModalUpload, setStatusModalUpload] = useState<OfflineUpload | null>(null);
  const [isFetchingAgreement, setIsFetchingAgreement] = useState(false);

  const handleFetchAgreement = async () => {
    setIsFetchingAgreement(true);
    try {
      const res = await refetch();
      const currentAgreements = res.data || [];
      const currentAg = currentAgreements[0];
      if (!currentAg) {
        Alert.alert(
          'Agreement Status',
          'Not filled yet: Rental agreement has not been initialized or submitted by the tenant.'
        );
      } else if (
        currentAg.status === 'pending_tenant_fill' ||
        !currentAg.form_data ||
        Object.keys(currentAg.form_data).length === 0 ||
        currentAg.tracker_stage < 1
      ) {
        Alert.alert(
          'Agreement Status',
          'Not filled yet: The tenant has not filled or submitted the agreement details form yet.'
        );
      } else {
        let docxName = currentAg.docx_file_name;
        if (!docxName) {
          try {
            const compRes = await apiClient.post(`/agreements/${currentAg.id}/compile-docx`);
            if (compRes.data?.docx_file_name) {
              docxName = compRes.data.docx_file_name;
            }
            await refetch();
          } catch {}
        }
        Alert.alert(
          'Agreement Synced',
          `Word document (.docx) is synced and ready.\nFile: ${docxName || 'agreement.docx'}`
        );
      }
    } catch (e: any) {
      Alert.alert('Fetch Error', parseApiError(e).message);
    } finally {
      setIsFetchingAgreement(false);
    }
  };

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: agreements = [],
    isLoading,
    refetch,
  } = useQuery<Agreement[]>({
    queryKey: ['agreements', 'tenant', tenantId],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/agreements?tenant_id=${tenantId}`);
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        // Agreements feature may not be initialized yet for this tenant
        return [];
      }
    },
    retry: false,
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

  const { data: tenancies = [] } = useQuery<any[]>({
    queryKey: ['tenancies', 'tenant', tenantId],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/tenancies?tenant_id=${tenantId}`);
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    enabled: !agreement,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const initAgreementMutation = useMutation({
    mutationFn: async () => {
      const activeTenancy = tenancies[0];
      if (!activeTenancy) {
        throw new Error('No active tenancy found for this tenant. Please check in the tenant first.');
      }
      const res = await apiClient.post('/agreements', {
        tenant_id: tenantId,
        tenancy_id: activeTenancy.id,
        template_id: 'A',
        template_name: 'Standard Lease Agreement',
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      Alert.alert('Success', 'Rental agreement initialized. Tenant can now fill and sign their contract.');
    },
    onError: (err: any) => Alert.alert('Initialization Failed', parseApiError(err).message),
  });

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
      file_base64?: string;
    }) => {
      const res = await apiClient.post(`/agreements/${payload.agId}/offline-upload`, {
        upload_type: payload.upload_type,
        file_name: payload.file_name,
        file_base64: payload.file_base64,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement-uploads', agreement?.id] });
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      Alert.alert('Success', 'Offline verification document uploaded successfully.');
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
      const res = await apiClient.post(`/agreements/${agId}/approve-and-archive`);
      return res.data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['agreement-uploads', agreement?.id] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['my-documents'] });
      Alert.alert(
        'Agreement Approved & Archived',
        `All files (Word agreement, PDF, tenant photo, Aadhaar, signature, offline docs) have been packaged and archived into AWS S3:\n\n${data?.s3_folder_path || ''}`
      );
    },
    onError: (err: any) => Alert.alert('Approval Error', parseApiError(err).message),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const [isReplacingDocx, setIsReplacingDocx] = useState(false);

  const handleReplaceDocx = async () => {
    if (!agreement) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      setIsReplacingDocx(true);
      const asset = res.assets[0];
      const fileName = asset.name || `agreement_${agreement.id}.docx`;

      let b64: string | null = null;
      try {
        b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
        });
      } catch {
        try {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const r = reader.result as string;
              resolve(r.includes(',') ? r.split(',')[1] : r);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch {}
      }

      if (!b64) throw new Error('Could not read Word file');

      await apiClient.post(`/agreements/${agreement.id}/replace-docx`, {
        file_name: fileName,
        file_base64: b64,
      });

      qc.invalidateQueries({ queryKey: ['agreements', 'tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['agreement-uploads', agreement.id] });
      Alert.alert('Agreement Updated', `Word agreement replaced with "${fileName}". Synced across mobile app & web portal.`);
    } catch (err: any) {
      Alert.alert('Replace Failed', parseApiError(err).message || 'Unable to update Word agreement');
    } finally {
      setIsReplacingDocx(false);
    }
  };

  const handleOfflineUpload = async (targetType?: OfflineUpload['upload_type']) => {
    if (!agreement) return;
    const typeToUpload = targetType || uploadType;
    if (isPickingRef.current) return;
    isPickingRef.current = true;

    Alert.alert('Add Offline Document', 'Choose document source', [
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
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              allowsEditing: false,
              base64: true,
            });
            if (!result.canceled && result.assets?.length) {
              const asset = result.assets[0];
              const fileName = asset.fileName ?? `${typeToUpload}_${Date.now()}.jpg`;
              let b64 = asset.base64;
              if (!b64 && asset.uri) {
                try {
                  b64 = await FileSystem.readAsStringAsync(asset.uri, {
                    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
                  });
                } catch {}
              }
              uploadMutation.mutate({
                agId: agreement.id,
                upload_type: typeToUpload,
                file_name: fileName,
                file_base64: b64 || undefined,
              });
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not access camera');
          } finally {
            isPickingRef.current = false;
          }
        },
      },
      {
        text: 'Photo Gallery',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission required', 'Gallery access is needed to select documents.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              allowsEditing: false,
              base64: true,
            });
            if (!result.canceled && result.assets?.length) {
              const asset = result.assets[0];
              const fileName = asset.fileName ?? `${typeToUpload}_${Date.now()}.jpg`;
              let b64 = asset.base64;
              if (!b64 && asset.uri) {
                try {
                  b64 = await FileSystem.readAsStringAsync(asset.uri, {
                    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
                  });
                } catch {}
              }
              uploadMutation.mutate({
                agId: agreement.id,
                upload_type: typeToUpload,
                file_name: fileName,
                file_base64: b64 || undefined,
              });
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not open picker');
          } finally {
            isPickingRef.current = false;
          }
        },
      },
      {
        text: 'PDF / Document File',
        onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['application/pdf', 'image/*'],
              copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets?.length) {
              const asset = result.assets[0];
              const fileName = asset.name ?? `${typeToUpload}_${Date.now()}.pdf`;
              let b64: string | undefined = undefined;
              if (asset.uri) {
                try {
                  b64 = await FileSystem.readAsStringAsync(asset.uri, {
                    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
                  });
                } catch {}
              }
              uploadMutation.mutate({
                agId: agreement.id,
                upload_type: typeToUpload,
                file_name: fileName,
                file_base64: b64,
              });
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not pick document');
          } finally {
            isPickingRef.current = false;
          }
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          isPickingRef.current = false;
        },
      },
    ]);
  };


  // ── Render helpers ─────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton variant="detail" />;

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

  const renderKycDocuments = () => {
    const hasPhoto = !!agreement?.tenant_photo_url || !!agreement?.tenant_photo_key;
    const hasAadhar = !!agreement?.aadhar_card_url || !!agreement?.aadhar_card_key;
    const hasSign = !!agreement?.signature_url || !!agreement?.signature_key;

    if (!hasPhoto && !hasAadhar && !hasSign) {
      return (
        <Card style={{ borderWidth: 1, marginBottom: space.md }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 8 }}>
            Tenant Identity & KYC Documents
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
            Tenant has not uploaded their photo, Aadhaar card, or signature yet.
          </Text>
        </Card>
      );
    }

    return (
      <Card style={{ borderWidth: 1, marginBottom: space.md }}>
        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 12 }}>
          Tenant Identity & KYC Documents
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          {/* Tenant Headshot */}
          <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>Photo</Text>
            {agreement?.tenant_photo_url ? (
              <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(resolveStorageUrl(agreement.tenant_photo_url!))}>
                <Image source={{ uri: resolveStorageUrl(agreement.tenant_photo_url) }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border }} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="person" size={26} color={colors.primary} />
              </View>
            )}
            <Text style={{ color: colors.text, fontSize: 10, marginTop: 4, textAlign: 'center' }}>Headshot</Text>
          </View>

          {/* Aadhaar Card */}
          <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>Aadhaar</Text>
            {agreement?.aadhar_card_url ? (
              <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(resolveStorageUrl(agreement.aadhar_card_url!))}>
                <Image source={{ uri: resolveStorageUrl(agreement.aadhar_card_url) }} style={{ width: 80, height: 64, borderRadius: 6, borderWidth: 1, borderColor: colors.border }} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80, height: 64, borderRadius: 6, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="card" size={26} color={colors.primary} />
              </View>
            )}
            <Text style={{ color: colors.text, fontSize: 10, marginTop: 4, textAlign: 'center' }}>National ID</Text>
          </View>

          {/* Signature */}
          <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>Signature</Text>
            {agreement?.signature_url ? (
              <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(resolveStorageUrl(agreement.signature_url!))}>
                <Image source={{ uri: resolveStorageUrl(agreement.signature_url), width: 80, height: 64 }} style={{ width: 80, height: 64, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', resizeMode: 'contain' }} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80, height: 64, borderRadius: 6, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="pencil" size={24} color={colors.primary} />
              </View>
            )}
            <Text style={{ color: colors.text, fontSize: 10, marginTop: 4, textAlign: 'center' }}>Signature</Text>
          </View>
        </View>
      </Card>
    );
  };

  const renderDocxSection = () => (
    <Card style={{ borderWidth: 1, marginBottom: space.md }}>
      <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 12 }}>
        Rental Agreement Documents (.docx & .pdf)
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
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Word File (.docx)"
                variant="secondary"
                onPress={async () => {
                  try {
                    const rawDownloadUrl =
                      agreement.docx_download_url ||
                      (await apiClient.get(`/agreements/${agreement.id}/download?doc_type=docx`)).data.download_url;
                    const resolved =
                      resolveStorageUrl(rawDownloadUrl) ||
                      `${apiClient.defaults.baseURL || ''}/agreements/${agreement.id}/file?doc_type=docx`;
                    if (resolved) await WebBrowser.openBrowserAsync(resolved);
                  } catch (e: any) {
                    Alert.alert('Download Error', parseApiError(e).message);
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="PDF Document"
                variant="secondary"
                onPress={async () => {
                  try {
                    const rawDownloadUrl =
                      agreement.pdf_download_url ||
                      (await apiClient.get(`/agreements/${agreement.id}/download?doc_type=pdf`)).data.download_url;
                    const resolved =
                      resolveStorageUrl(rawDownloadUrl) ||
                      `${apiClient.defaults.baseURL || ''}/agreements/${agreement.id}/file?doc_type=pdf`;
                    if (resolved) await WebBrowser.openBrowserAsync(resolved);
                  } catch (e: any) {
                    Alert.alert('Download Error', parseApiError(e).message);
                  }
                }}
              />
            </View>
          </View>
          <Button
            label={isReplacingDocx ? "Uploading Word File..." : "Replace / Reissue Word Agreement (.docx)"}
            variant="primary"
            disabled={isReplacingDocx}
            onPress={handleReplaceDocx}
            style={{ marginTop: 12 }}
          />
        </View>
      ) : (
        <View>
          <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginBottom: 12 }}>
            The agreement document has not been compiled yet. Compile it from the tenant's submitted form data or upload an edited Word file directly.
          </Text>
          <Button
            label="Compile Agreement (.docx & .pdf)"
            loading={compileMutation.isPending}
            disabled={!agreement || agreement.tracker_stage < 1}
            onPress={() => agreement && compileMutation.mutate(agreement.id)}
          />
          <Button
            label={isReplacingDocx ? "Uploading Word File..." : "Upload Existing Word File (.docx)"}
            variant="secondary"
            disabled={isReplacingDocx}
            onPress={handleReplaceDocx}
            style={{ marginTop: 10 }}
          />
        </View>
      )}
    </Card>
  );

  const renderOfflineUploads = () => (
    <Card style={{ borderWidth: 1, marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
          Offline Verification Documents
        </Text>
        <TouchableOpacity
          onPress={() => setUploadModalVisible(true)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 10,
            gap: 8,
            minHeight: 42,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 }}>+ Add Document</Text>
        </TouchableOpacity>
      </View>

      {uploads.length === 0 ? (
        <View style={{ paddingVertical: space.md, alignItems: 'center' }}>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, textAlign: 'center', marginBottom: space.sm }}>
            No offline documents uploaded yet. Add stamp paper photos, police verification, or notary stamps here.
          </Text>
          <TouchableOpacity
            onPress={() => setUploadModalVisible(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: colors.primary + '10',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              gap: 6,
            }}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Upload First Document</Text>
          </TouchableOpacity>
        </View>
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
              {up.download_url || up.file_url || up.id ? (
                <TouchableOpacity
                  onPress={async () => {
                    const fallbackUrl = agreement?.id
                      ? `${apiClient.defaults.baseURL || ''}/agreements/${agreement.id}/uploads/${up.id}/file`
                      : null;
                    const resolved = resolveStorageUrl(up.download_url || up.file_url) || fallbackUrl;
                    if (resolved) {
                      await WebBrowser.openBrowserAsync(resolved);
                    } else {
                      Alert.alert('Notice', 'Document file is currently unavailable.');
                    }
                  }}
                  style={{ padding: 6, marginRight: 6 }}
                >
                  <Ionicons name="eye-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
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
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>Legal Workspace</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={handleFetchAgreement}
              disabled={isFetchingAgreement}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.primary + '18',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
              }}
              accessibilityLabel="Fetch Agreement"
            >
              {isFetchingAgreement ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
              ) : (
                <Ionicons name="cloud-download-outline" size={15} color={colors.primary} style={{ marginRight: 4 }} />
              )}
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Fetch Agreement</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const baseUrl = apiClient.defaults.baseURL?.replace(/\/api\/v1\/?$/, '') || 'http://localhost:8000';
                WebBrowser.openBrowserAsync(`${baseUrl}/api/v1/vault/portal`);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
              accessibilityLabel="Open AWS S3 Confidential Vault"
            >
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Vault</Text>
            </TouchableOpacity>
          </View>
        </View>


        <ScrollView contentContainerStyle={{ paddingHorizontal: horizontalGutter, paddingBottom: contentBottomPadding }}>
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
              <Ionicons name="document-attach-outline" size={48} color={colors.primary} style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.h3.fontSize, textAlign: 'center', marginBottom: 6 }}>
                Rental Agreement Not Initialized
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, textAlign: 'center', marginBottom: 16 }}>
                Initialize the standard lease agreement so this tenant can review, fill their KYC details, and sign the contract.
              </Text>
              <Button
                label="Initialize Rental Agreement"
                loading={initAgreementMutation.isPending}
                onPress={() => initAgreementMutation.mutate()}
              />
            </Card>
          ) : agreement.status === 'pending_tenant_fill' || agreement.tracker_stage === 0 ? (
            <Card style={{ borderWidth: 1, padding: space.xl, alignItems: 'center' }}>
              <Ionicons name="time-outline" size={48} color="#F59E0B" style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.h3.fontSize, textAlign: 'center', marginBottom: 6 }}>
                Agreement Not Filled Yet
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, textAlign: 'center', marginBottom: 8, lineHeight: 20 }}>
                The rental agreement has been initialized for this tenant. The tenant has not yet filled or submitted their agreement details and KYC documents.
              </Text>
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12, width: '100%', marginTop: 8, marginBottom: 16 }}>
                <Text style={{ color: '#92400E', fontSize: font.caption.fontSize, textAlign: 'center', fontWeight: '700' }}>
                  Status: Not filled yet — waiting for tenant to fill and submit the agreement form
                </Text>
              </View>
              <Button
                label={isFetchingAgreement ? 'Checking...' : 'Fetch Agreement (.docx)'}
                variant="secondary"
                loading={isFetchingAgreement}
                onPress={handleFetchAgreement}
              />
            </Card>
          ) : (
            <>
              {agreement.docx_file_name ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: space.sm }}>
                  <Ionicons name="checkmark-circle" size={18} color="#059669" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#065F46', fontWeight: '700', fontSize: font.caption.fontSize }}>
                      Synced: Word Document (.docx) Ready
                    </Text>
                    <Text style={{ color: '#047857', fontSize: 11 }}>
                      {agreement.docx_file_name}
                    </Text>
                  </View>
                </View>
              ) : null}
              {renderTracker()}
              {renderKycDocuments()}
              {renderFormData()}
              {renderDocxSection()}
              {renderOfflineUploads()}

              {/* Final Approval & AWS S3 Vault Archiving */}
              {agreement.tracker_stage >= 2 && agreement.status !== 'approved' && (
                <Button
                  label="Approve & Upload to AWS S3 Vault"
                  loading={approveMutation.isPending}
                  onPress={() => {
                    Alert.alert(
                      'Confirm Final Approval',
                      'This will package the Word agreement, PDF, tenant photo, Aadhaar card, signature, and all offline verification stamps into AWS S3 storage under the tenant unit directory and publish them into the tenant Legal Vault. This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Approve & Archive', onPress: () => approveMutation.mutate(agreement.id) },
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
                  {agreement.s3_folder_path ? (
                    <Text style={{ color: semanticColor.success.fg, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
                      AWS S3 Location: {agreement.s3_folder_path}
                    </Text>
                  ) : null}
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
                    setUploadModalVisible(false);
                    handleOfflineUpload(t.type);
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
