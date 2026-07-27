import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface NotificationItem {
  id: number;
  channel: string;
  notification_type: string;
  title: string;
  message: string;
  status: 'read' | 'unread';
  sent_at: string;
  created_at: string;
}

export const NotificationsView: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications');
      return res.data;
    },
  });

  const readMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.patch(`/notifications/${id}/read`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'recent'] });
    },
  });

  const handleMarkRead = (id: number, currentStatus: string) => {
    if (currentStatus === 'read') return;
    readMutation.mutate(id);
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      try {
        navigation.navigate('MoreHome');
      } catch (_) {
        navigation.navigate('Dashboard');
      }
    }
  };

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderNotifItem = ({ item }: { item: NotificationItem }) => {
    const isUnread = item.status !== 'read';
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleMarkRead(item.id, item.status)}
        style={{ marginBottom: space.sm }}
      >
        <Card style={[styles.card, { borderColor: isUnread ? colors.primary : colors.border, borderLeftWidth: isUnread ? 4 : 1 }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, marginRight: space.sm }}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                {item.title}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 4 }}>
                {item.message}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 8 }}>
                {new Date(item.created_at).toLocaleString()} · Channel: {item.channel.toUpperCase()}
              </Text>
            </View>
            <Badge status={item.status} />
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Notifications
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderNotifItem}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="All Caught Up!"
            body="You have no notifications or property broadcasts at this time."
          />
        }
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
});
