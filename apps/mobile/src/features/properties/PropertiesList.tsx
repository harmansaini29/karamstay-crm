import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface Property {
  id: number;
  name: string;
  address: string;
  property_type: string;
  city: string;
  state: string;
  pincode: string;
  is_active: boolean;
}

export const PropertiesList: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();
  const isOwner = user?.role?.name === 'owner';

  const {
    data: properties = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await apiClient.get('/properties');
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderPropertyItem = ({ item }: { item: Property }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate('PropertyDetail', { id: item.id })}
      style={{ marginBottom: space.md }}
    >
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text, fontSize: font.h3.fontSize }]}>
              {item.name}
            </Text>
            <Text style={[styles.typeText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
              {item.property_type.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: item.is_active ? colors.primary + '15' : colors.border }]}>
            <Text style={{ color: item.is_active ? colors.primary : colors.textMuted, fontWeight: 'bold', fontSize: 11 }}>
              {item.is_active ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.addressRow}>
          <Ionicons name="location-sharp" size={16} color={colors.textMuted} style={{ marginRight: space.xs }} />
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, flex: 1 }}>
            {item.address}, {item.city}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
            MANAGE PORTFOLIO
          </Text>
          <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
            Properties
          </Text>
        </View>
        {isOwner ? (
          <Button
            label="Add"
            onPress={() => navigation.navigate('PropertyForm', {})}
            size="compact"
            style={{ width: 80 }}
          />
        ) : null}
      </View>

      <FlatList
        data={properties}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPropertyItem}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="No Properties Found"
            body="Start by adding your first rental property to get started."
            ctaLabel={isOwner ? 'Add Property' : undefined}
            onPress={isOwner ? () => navigation.navigate('PropertyForm', {}) : undefined}
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
  card: {
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontWeight: 'bold',
  },
  typeText: {
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
