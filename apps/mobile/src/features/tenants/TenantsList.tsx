import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface Tenant {
  id: number;
  user_id: number | null;
  name: string;
  phone: string;
  email: string | null;
  status: string;
}

export const TenantsList: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const {
    data: tenants = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const res = await apiClient.get('/tenants');
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  // Filter tenants client-side
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.phone.includes(search) ||
      (t.email && t.email.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && t.status.toLowerCase() === 'active') ||
      (statusFilter === 'inactive' && t.status.toLowerCase() !== 'active');

    return matchesSearch && matchesStatus;
  });

  const renderTenantItem = ({ item }: { item: Tenant }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate('TenantDetail', { id: item.id })}
      style={{ marginBottom: space.md }}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              {item.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              {item.phone} {item.email ? `· ${item.email}` : ''}
            </Text>
          </View>
          <Badge status={item.status} />
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
            TENANT ROSTER
          </Text>
          <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
            Tenants
          </Text>
        </View>
        <Button
          label="Add Tenant"
          onPress={() => navigation.navigate('TenantForm')}
          size="compact"
          style={{ width: 110 }}
        />
      </View>

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: space.xs }} />
          <TextInput
            placeholder="Search by name, phone or email..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tab Filters */}
        <View style={styles.tabRow}>
          {['all', 'active', 'inactive'].map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() => setStatusFilter(status as any)}
              style={[
                styles.tabButton,
                {
                  backgroundColor: statusFilter === status ? colors.primary + '15' : 'transparent',
                  borderColor: statusFilter === status ? colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: statusFilter === status ? colors.primary : colors.textMuted,
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  fontSize: font.caption.fontSize,
                }}
              >
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tenants List */}
      <FlatList
        data={filteredTenants}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTenantItem}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="No Tenants Found"
            body="Try resetting the search query or status filter, or add a new tenant profile."
            ctaLabel="Add Tenant"
            onPress={() => navigation.navigate('TenantForm')}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  filterSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
  tabRow: {
    flexDirection: 'row',
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
    marginRight: 8,
  },
  card: {
    borderWidth: 1,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
