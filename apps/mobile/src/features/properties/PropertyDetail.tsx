import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { useFinancialMask } from '../../hooks/useFinancialMask';

interface Property {
  id: number;
  name: string;
  address: string;
  property_type: string;
  city: string;
  state: string;
  pincode: string;
  is_active: boolean;
  latitude?: number;
  longitude?: number;
}

interface Unit {
  id: number;
  unit_no: string;
  unit_type: string;
  rent: number;
  deposit: number;
  status: 'vacant' | 'occupied';
  notes: string;
}

export const PropertyDetail: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { id } = route.params;
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role?.name === 'owner';
  const [unitFilter, setUnitFilter] = useState<'all' | 'vacant' | 'occupied'>('all');

  // Get details
  const {
    data: property,
    isLoading: isPropLoading,
    isError: isPropError,
    error: propError,
  } = useQuery<Property>({
    queryKey: ['property', id],
    queryFn: async () => {
      const res = await apiClient.get(`/properties/${id}`);
      return res.data;
    },
  });

  // Get units
  const {
    data: units = [],
    isLoading: isUnitsLoading,
    refetch: refetchUnits,
  } = useQuery<Unit[]>({
    queryKey: ['property-units', id],
    queryFn: async () => {
      const res = await apiClient.get(`/properties/${id}/units`);
      return res.data;
    },
  });

  // Delete property mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/properties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    Alert.alert(
      'Delete Property',
      'Are you sure you want to delete this property? This action is permanent and irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  // ⚠️ Custom hooks must precede all conditional returns (Rules of Hooks)
  const { maskAmount } = useFinancialMask();

  if (isPropLoading || isUnitsLoading) return <LoadingSkeleton variant="detail" />;
  if (isPropError || !property) {
    return (
      <ErrorState
        message={parseApiError(propError || new Error('Property not found')).message}
        onRetry={() => {}}
      />
    );
  }

  const filteredUnits = units.filter((u) => {
    if (unitFilter === 'all') return true;
    return u.status === unitFilter;
  });

  const renderUnitItem = ({ item }: { item: Unit }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate('UnitDetail', { id: item.id })}
      style={{ marginBottom: space.sm }}
    >
      <Card style={[styles.unitCard, { borderColor: colors.border }]}>
        <View style={styles.unitRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              Unit {item.unit_no}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
              {item.unit_type.toUpperCase()} · Rent: {maskAmount(item.rent)}
            </Text>
          </View>
          <Badge status={item.status} />
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      {/* Header Navigation */}
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        {isOwner ? (
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity
              style={{ marginRight: space.lg }}
              onPress={() => navigation.navigate('PropertyForm', { id: property.id })}
            >
              <Text style={{ color: colors.primary, fontSize: font.body.fontSize, fontWeight: '600' }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} disabled={deleteMutation.isPending}>
              <Text style={{ color: semanticColor.error.solid, fontSize: font.body.fontSize, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <FlatList
        data={filteredUnits}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderUnitItem}
        contentContainerStyle={{ padding: space.lg }}
        ListHeaderComponent={
          <View>
            {/* Property Overview */}
            <Card style={{ marginBottom: space.lg, borderWidth: 1 }}>
              <Text style={[styles.propName, { color: colors.text, fontSize: font.h2.fontSize }]}>
                {property.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginTop: space.xs }}>
                {property.property_type.toUpperCase()}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: space.sm }}>
                {property.address}, {property.city}, {property.state} - {property.pincode}
              </Text>
            </Card>

            {/* Map Preview Card */}
            {property.latitude && property.longitude ? (
              <Card style={{ marginBottom: space.lg, padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                <View style={{ height: 120, backgroundColor: colors.primary + '10', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="map-outline" size={32} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.caption.fontSize, marginTop: 4 }}>
                    GPS Coordinates Dropped
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: colors.surface }}
                >
                  <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.caption.fontSize }}>
                    Open in Google Maps
                  </Text>
                </TouchableOpacity>
              </Card>
            ) : null}

            {/* v2 Manager assignment banner */}
            <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="information-circle" size={20} color={colors.primary} style={{ marginRight: space.sm }} />
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, flex: 1 }}>
                Manager-to-property assignment is DB-only today. Direct manager assignments will be available in v2.
              </Text>
            </View>

            {/* Unit filter tabs */}
            <View style={styles.unitsHeader}>
              <Text style={[styles.unitsTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
                Units ({units.length})
              </Text>
              {isOwner ? (
                <TouchableOpacity onPress={() => navigation.navigate('UnitForm', { propertyId: property.id })}>
                  <Text style={{ color: colors.primary, fontSize: font.caption.fontSize, fontWeight: '600' }}>
                    + Add Unit
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              {(['all', 'vacant', 'occupied'] as const).map((filter) => (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setUnitFilter(filter)}
                  style={[
                    styles.filterTab,
                    {
                      backgroundColor: unitFilter === filter ? colors.primary + '15' : 'transparent',
                      borderColor: unitFilter === filter ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: unitFilter === filter ? colors.primary : colors.textMuted, fontWeight: '600', textTransform: 'capitalize', fontSize: font.caption.fontSize }}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', padding: space.xl }}>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>No units added yet</Text>
          </Card>
        }
        refreshing={isUnitsLoading}
        onRefresh={refetchUnits}
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
  propName: {
    fontWeight: 'bold',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 24,
  },
  unitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitsTitle: {
    fontWeight: 'bold',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
    marginRight: 8,
  },
  unitCard: {
    borderWidth: 1,
    padding: 12,
  },
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
