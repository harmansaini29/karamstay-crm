import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

import { Button } from '../../components/Button';
import { AgreementTrackerCard } from '../../components/AgreementTrackerCard';

interface DocumentItem {
  id: number;
  document_type: string;
  file_name: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
}

export const TenantDocumentsScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();
  const { contentBottomPadding, horizontalGutter } = useResponsiveLayout();

  const {
    data: documents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DocumentItem[]>({
    queryKey: ['my-documents'],
    queryFn: async () => {
      const res = await apiClient.get('/documents');
      return res.data;
    },
  });

  const {
    data: agreements = [],
    isLoading: isAgreementsLoading,
    refetch: refetchAgreements,
  } = useQuery<any[]>({
    queryKey: ['my-agreements'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/agreements');
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
  });

  const agreement = agreements[0] ?? null;

  const handleRefresh = () => {
    refetch();
    refetchAgreements();
  };


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

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderDocumentItem = ({ item }: { item: DocumentItem }) => (
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
            <Badge status={item.status === 'approved' ? 'vacant' : item.status === 'rejected' ? 'occupied' : 'pending'} />
            {item.status === 'rejected' && item.rejection_reason ? (
              <Text style={{ color: semanticColor.error.solid, fontSize: 11, marginLeft: 8, fontWeight: 'bold' }} numberOfLines={1}>
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
  );

  const renderHeader = () => (
    <View style={{ marginBottom: space.md }}>
      {/* Agreement & Contract Card */}
      {agreement ? (
        <Card style={{ borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                <Ionicons name="document-text" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>
                  {agreement.template_name || 'Rental Agreement'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                  Legal Tenancy Contract
                </Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: agreement.tracker_stage >= 4 ? semanticColor.success.bg : semanticColor.warning.bg }}>
              <Text style={{ color: agreement.tracker_stage >= 4 ? semanticColor.success.fg : semanticColor.warning.fg, fontWeight: '700', fontSize: 10 }}>
                {agreement.tracker_stage >= 4 ? 'APPROVED & ARCHIVED' : `STAGE ${agreement.tracker_stage || 1} / 4`}
              </Text>
            </View>
          </View>

          {/* Stepper tracker */}
          <View style={{ marginVertical: 8 }}>
            <AgreementTrackerCard stage={agreement.tracker_stage || 0} />
          </View>

          {/* Action buttons */}
          {(!agreement.tracker_stage || (agreement.tracker_stage <= 1 && agreement.status !== 'docx_generated' && agreement.status !== 'approved')) ? (
            <Button
              label="Fill & Sign Agreement Now"
              onPress={() => navigation?.navigate('TenantAgreementFormScreen', { agreementId: agreement.id })}
              style={{ marginTop: 8 }}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {agreement.pdf_download_url || agreement.docx_download_url ? (
                <View style={{ flex: 1 }}>
                  <Button
                    label="Download Contract"
                    variant="secondary"
                    onPress={() => {
                      const url = agreement.pdf_download_url || agreement.docx_download_url;
                      if (url) WebBrowser.openBrowserAsync(url);
                    }}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Button
                  label={agreement.tracker_stage >= 4 ? 'View Agreement' : 'Edit / Review Form'}
                  variant={agreement.pdf_download_url ? 'primary' : 'secondary'}
                  onPress={() => navigation?.navigate('TenantAgreementFormScreen', { agreementId: agreement.id })}
                />
              </View>
            </View>
          )}
        </Card>
      ) : (
        <Card style={{ borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="information-circle-outline" size={24} color={colors.primary} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>
                Rental Agreement Not Initiated
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Once your property manager assigns your room agreement, you can fill your legal details and KYC documents here.
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Section title for documents */}
      <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginTop: 8, marginBottom: 4 }}>
        Archived Verification Files ({documents.length})
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          LEGAL VAULT
        </Text>
        <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
          Documents
        </Text>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderDocumentItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ paddingHorizontal: horizontalGutter, paddingBottom: contentBottomPadding }}
        ListEmptyComponent={
          <EmptyState
            title="No Extra Files Yet"
            body="Documents like signed rental contracts and payment receipts uploaded by your manager will show here."
          />
        }
        refreshing={isLoading || isAgreementsLoading}
        onRefresh={handleRefresh}
      />

    
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  titleText: {
    fontWeight: 'bold',
  },
  subtitle: {
    fontWeight: 'bold',
    letterSpacing: 1,
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
});
