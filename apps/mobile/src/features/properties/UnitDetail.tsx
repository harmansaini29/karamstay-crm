import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Button } from '../../components/Button';
import { BedDragGrid } from '../../components/BedDragGrid';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

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
  const [occupiedBedId, setOccupiedBedId] = useState<number | null>(null);

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
  } = useQuery<any[]>({
    queryKey: ['unit-beds', id],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${id}/beds`);
      return res.data;
    },
    enabled: !!unit && unit.capacity > 1,
  });

  // Fetch all active tenancies for this unit (drives the occupied-bed modal)
  const { data: unitTenancies = [] } = useQuery<any[]>({
    queryKey: ['unit-tenancies', id],
    queryFn: async () => {
      const res = await apiClient.get('/tenancies');
      return Array.isArray(res.data)
        ? res.data.filter((t: any) => t.unit_id === id && t.status === 'active')
        : [];
    },
    enabled: !!unit && unit.capacity > 1,
  });

  // Build bedId → tenancy lookup for the modal
  const bedTenancyMap: Record<number, any> = {};
  for (const tenancy of unitTenancies) {
    if (Array.isArray(tenancy.bed_ids)) {
      for (const bid of tenancy.bed_ids) {
        bedTenancyMap[bid] = tenancy;
      }
    }
  }
  const modalTenantId: number | undefined = occupiedBedId !== null
    ? bedTenancyMap[occupiedBedId]?.tenant_id
    : undefined;

  const { data: modalTenant, isFetching: isModalTenantFetching } = useQuery<any>({
    queryKey: ['tenant', modalTenantId],
    queryFn: async () => {
      const res = await apiClient.get(`/tenants/${modalTenantId}`);
      return res.data;
    },
    enabled: modalTenantId != null,
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
    const params = {
      propertyId: unit?.property_id,
      unitId: unit?.id,
      bedIds: selectedBeds,
      rent: unit ? unit.rent : 0,
      deposit: unit ? unit.deposit : 0,
    };
    try {
      navigation.navigate('CheckInForm', params);
    } catch (_) {
      navigation.navigate('Tenants', { screen: 'CheckInForm', params });
    }
  };

  const handleCheckInSingle = () => {
    const params = {
      propertyId: unit?.property_id,
      unitId: unit?.id,
      rent: unit ? unit.rent : 0,
      deposit: unit ? unit.deposit : 0,
    };
    try {
      navigation.navigate('CheckInForm', params);
    } catch (_) {
      navigation.navigate('Tenants', { screen: 'CheckInForm', params });
    }
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
      <ResponsiveContainer>
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

          <View style={[styles.infoGrid, { marginTop: space.md }]}>
            <View style={styles.infoCol}>
              <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Building</Text>
              <Text style={[styles.value, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {unit.building || 'Main'}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Floor</Text>
              <Text style={[styles.value, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {unit.floor}
              </Text>
            </View>
          </View>

          <View style={[styles.infoGrid, { marginTop: space.md }]}>
            <View style={styles.infoCol}>
              <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Monthly Rent</Text>
              <Text style={[styles.value, { color: colors.primary, fontSize: font.h3.fontSize }]}>
                {formatCurrency(unit.rent)}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Deposit</Text>
              <Text style={[styles.value, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                {formatCurrency(unit.deposit)}
              </Text>
            </View>
          </View>

          {unit.notes ? (
            <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Notes</Text>
              <Text style={{ color: colors.text, fontSize: font.body.fontSize, marginTop: 2 }}>
                {unit.notes}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Map Location Link */}
        {unit.latitude && unit.longitude ? (
          <Card style={{ borderWidth: 1, marginBottom: space.md, padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: space.md, backgroundColor: colors.surfaceSoft }}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.caption.fontSize }}>
                GEOLOCATION COORDINATES
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
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

        {/* Bed-Level Slots — Gesture Drag Grid */}
        {unit.capacity > 1 ? (
          <Card style={{ borderWidth: 1, marginBottom: space.md }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.xs }}>
              Bed Inventory Slot Grid
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.sm }}>
              Tap to select • Long-press a vacant bed and drag onto another to merge for a shared check-in.
            </Text>

            <BedDragGrid
              beds={beds}
              selectedBeds={selectedBeds}
              onToggle={handleToggleBed}
              onMerge={(bedIds) => {
                // Select both merged beds and trigger check-in flow immediately
                const uniqueIds = Array.from(new Set([...selectedBeds, ...bedIds]));
                setSelectedBeds(uniqueIds);
              }}
              onOccupiedTap={(bedId) => setOccupiedBedId(bedId)}
            />

            {/* Check-in button */}
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
      </ScrollView>
      </ResponsiveContainer>

      {/* Occupied Bed — Tenant Info Modal */}
      <Modal
        visible={occupiedBedId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOccupiedBedId(null)}
      >
        <TouchableWithoutFeedback onPress={() => setOccupiedBedId(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: space.md }}>
                  Bed Occupant
                </Text>

                {isModalTenantFetching ? (
                  <ActivityIndicator color={colors.primary} />
                ) : modalTenant ? (
                  <View>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>
                      {modalTenant.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 4 }}>
                      {modalTenant.phone}{modalTenant.email ? ` · ${modalTenant.email}` : ''}
                    </Text>
                    {modalTenant.occupation ? (
                      <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                        {modalTenant.occupation}
                      </Text>
                    ) : null}
                    {modalTenant.emergency_contact_name ? (
                      <View style={{ marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>EMERGENCY CONTACT</Text>
                        <Text style={{ color: colors.text, fontSize: font.caption.fontSize, marginTop: 2 }}>
                          {modalTenant.emergency_contact_name} · {modalTenant.emergency_contact_phone}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize }}>
                    No tenant information found for this bed.
                  </Text>
                )}

                <TouchableOpacity
                  onPress={() => setOccupiedBedId(null)}
                  style={[styles.modalCloseBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    alignItems: 'flex-start',
  },
  unitTitle: {
    fontWeight: 'bold',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
  },
  label: {
    textTransform: 'uppercase',
  },
  value: {
    fontWeight: 'bold',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  modalCloseBtn: {
    marginTop: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
});
