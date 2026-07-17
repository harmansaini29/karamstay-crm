import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

interface DocumentItem {
  id: number;
  document_type: string;
  file_name: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
}

export const TenantDocumentsScreen: React.FC = () => {
  const { colors, font, space } = useTheme();

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
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
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="Vault is Empty"
            body="Documents like signed rental contracts and payment receipts uploaded by your manager will show here."
          />
        }
        refreshing={isLoading}
        onRefresh={refetch}
      />
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
