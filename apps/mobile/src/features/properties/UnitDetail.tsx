import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';

interface Unit {
  id: number;
  property_id: number;
  building: string;
  floor: number | string;
  unit_no: string;
  unit_type: string;
  rent: number;
  deposit: number;
  status: 'vacant' | 'occupied';
  capacity: number;
  notes: string | null;
  latitude?: number;
  longitude?: number;
}

export const UnitDetail: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { id } = route.params;
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role?.name === 'owner';
  const isManager = user?.role?.name === 'manager';

  const [selectedBeds, setSelectedBeds] = useState<number[]>([]);

  const {
    data: unit,
    isLoading: isUnitLoading,
    isError: isUnitError,
    error,
  } = useQuery<Unit>({
    queryKey: ['unit', id],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${id}`);
      return res.data;
    },
  });

  // Query beds for shared units
  const {
    data: beds = [],
    isLoading: isBedsLoading,
    refetch: refetchBeds,
  } = useQuery<any[]>({
    queryKey: ['unit-beds', id],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${id}/beds`);
      return res.data;
    },
    enabled: !!unit && unit.capacity > 1,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/units/${id}`);
    },
    onSuccess: () => {
      if (unit) {
        queryClient.invalidateQueries({ queryKey: ['property-units', unit.property_id] });
      }
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    Alert.alert(
      'Delete Unit',
      'Are you sure you want to delete this rental unit? This action cannot be undone.',
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

  const handleToggleBed = (bedId: number) => {
    setSelectedBeds((prev) => {
      if (prev.includes(bedId)) {
        return prev.filter((bid) => bid !== bedId);
      } else {
        return [...prev, bedId];
      }
    });
  };

  const handleCheckInBeds = () => {
    if (selectedBeds.length === 0) return;
    navigation.navigate('CheckInForm', {
      propertyId: unit?.property_id,
      unitId: unit?.id,
      bedIds: selectedBeds,
      rent: unit ? unit.rent : 0,
      deposit: unit ? unit.deposit : 0,
    });
  };

  const handleCheckInSingle = () => {
    navigation.navigate('CheckInForm', {
      propertyId: unit?.property_id,
      unitId: unit?.id,
      rent: unit ? unit.rent : 0,
      deposit: unit ? unit.deposit : 0,
    });
  };

  if (isUnitLoading || (unit && unit.capacity > 1 && isBedsLoading)) {
    return <LoadingSkeleton variant="detail" />;
  }

  if (isUnitError || !unit) {
    return (
      <ErrorState
        message={parseApiError(error || new Error('Unit not found')).message}
        onRetry={() => {}}
      />
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        {isOwner ? (
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity
              style={{ marginRight: space.lg }}
              onPress={() => navigation.navigate('UnitForm', { propertyId: unit.property_id, id: unit.id })}
            >
              <Text style={{ color: colors.primary, fontSize: font.body.fontSize, fontWeight: '600' }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} disabled={deleteMutation.isPending}>
              <Text style={{ color: semanticColor.error.solid, fontSize: font.body.fontSize, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {/* Unit Details Card */}
        <Card style={{ borderWidth: 1, marginBottom: space.md }}>
          <View style={styles.titleRow}>
            <View>
              <Text style={[styles.unitTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                Unit {unit.unit_no}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                {unit.unit_type.toUpperCase()}
              </Text>
            </View>
            <Badge status={unit.status} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Monthly Rent</Text>
              <Text style={[styles.infoVal, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {formatCurrency(unit.rent)}
              </Text>
            </View>

            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Security Deposit</Text>
              <Text style={[styles.infoVal, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {formatCurrency(unit.deposit)}
              </Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Building</Text>
              <Text style={[styles.infoVal, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {unit.building || 'N/A'}
              </Text>
            </View>

            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Floor</Text>
              <Text style={[styles.infoVal, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {unit.floor || 'N/A'}
              </Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Max Capacity</Text>
              <Text style={[styles.infoVal, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {unit.capacity} {unit.capacity === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Map Preview Card */}
        {unit.latitude && unit.longitude ? (
          <Card style={{ marginBottom: space.md, padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <View style={{ height: 100, backgroundColor: colors.primary + '10', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="map-outline" size={28} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.caption.fontSize, marginTop: 4 }}>
                Unit Location Pin Dropped
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {unit.latitude.toFixed(6)}, {unit.longitude.toFixed(6)}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${unit.latitude},${unit.longitude}`);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: colors.surface }}
            >
              <Ionicons name="location-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.caption.fontSize }}>
                Open in Google Maps
              </Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {/* Bed-Level Slots Multi-select */}
        {unit.capacity > 1 ? (
          <Card style={{ borderWidth: 1, marginBottom: space.md }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.xs }}>
              Bed Inventory Slot Grid
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.sm }}>
              Tap vacant slots to select them for a merged check-in.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {beds.map((bed) => {
                const isSelected = selectedBeds.includes(bed.id);
                const isVacant = bed.status === 'vacant';
                
                return (
                  <TouchableOpacity
                    key={bed.id}
                    disabled={!isVacant}
                    onPress={() => handleToggleBed(bed.id)}
                    style={{
                      width: '48%',
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected ? colors.primary + '08' : colors.surface,
                      borderRadius: radius.md,
                      padding: 12,
                      marginBottom: 10,
                      opacity: isVacant ? 1 : 0.7,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.caption.fontSize }}>
                        {bed.bed_no}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                    </View>
                    <Badge status={bed.status} style={{ marginTop: 8 }} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Checkin merge button */}
            {selectedBeds.length > 0 && (isOwner || isManager) ? (
              <Button
                label={`Check-in Tenant to Selected Beds (${selectedBeds.length})`}
                onPress={handleCheckInBeds}
                style={{ marginTop: space.sm }}
              />
            ) : null}
          </Card>
        ) : (
          /* Single capacity unit check-in trigger */
          unit.status === 'vacant' && (isOwner || isManager) ? (
            <Button
              label="Check-in Tenant to Unit"
              onPress={handleCheckInSingle}
              style={{ marginBottom: space.md }}
            />
          ) : null
        )}

        <Card style={{ borderWidth: 1 }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }}>
            Unit Notes
          </Text>
          <Text style={{ color: unit.notes ? colors.text : colors.textMuted, fontSize: font.body.fontSize, lineHeight: 20 }}>
            {unit.notes || 'No notes added for this unit.'}
          </Text>
        </Card>
      </ScrollView>
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unitTitle: {
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoCol: {
    width: '48%',
  },
  infoLabel: {
    marginBottom: 4,
  },
  infoVal: {
    fontWeight: 'bold',
  },
});
