import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
  Modal,
  TouchableWithoutFeedback,
  ActivityIndicator,
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
import { BedDragGrid } from '../../components/BedDragGrid';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { useFinancialMask } from '../../hooks/useFinancialMask';

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
  beds?: BedItem[];
}

interface BedItem {
  id: number;
  bed_no: string;
  status: 'vacant' | 'occupied' | string;
  room_type: string | null;
  tenant_id?: number | null;
  tenant_name?: string | null;
}

// ── Bed block display config ─────────────────────────────────────────────────
const BLOCK_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  MASTER_BED: { label: 'Master Bed', color: '#8B5CF6', icon: 'bed-outline' },
  COMMON_BED:  { label: 'Common Bed', color: '#3B82F6', icon: 'people-outline' },
  HALL:        { label: 'Hall',        color: '#F59E0B', icon: 'home-outline' },
  // Fallback for legacy beds without room_type
  UNKNOWN:     { label: 'Beds',        color: '#6B7280', icon: 'cube-outline' },
};

// ── Grouped Bed Card Section ─────────────────────────────────────────────────
interface BedGroupSectionProps {
  blockKey: string;
  beds: BedItem[];
  selectedBeds: number[];
  onToggle: (id: number) => void;
  onOccupiedTap: (id: number) => void;
  onQuickAssign: (bedId: number) => void;
  isOwner: boolean;
  isManager: boolean;
  colors: any;
  font: any;
  space: any;
}

const BedGroupSection: React.FC<BedGroupSectionProps> = ({
  blockKey,
  beds,
  selectedBeds,
  onToggle,
  onOccupiedTap,
  onQuickAssign,
  isOwner,
  isManager,
  colors,
  font,
  space,
}) => {
  const cfg = BLOCK_CONFIG[blockKey] || BLOCK_CONFIG.UNKNOWN;
  return (
    <View style={{ marginBottom: space.md }}>
      {/* Block header */}
      <View style={[styles.blockHeader, { backgroundColor: cfg.color + '14' }]}>
        <Ionicons name={cfg.icon as any} size={14} color={cfg.color} style={{ marginRight: 6 }} />
        <Text style={{ color: cfg.color, fontWeight: '700', fontSize: font.caption.fontSize, letterSpacing: 0.6 }}>
          {cfg.label.toUpperCase()}
        </Text>
        <Text style={{ color: cfg.color + 'AA', fontSize: 11, marginLeft: 6 }}>
          ({beds.filter((b) => b.status === 'vacant').length} vacant / {beds.length} total)
        </Text>
      </View>

      {/* Individual bed rows */}
      {beds.map((bed) => {
        const isSelected = selectedBeds.includes(bed.id);
        const isOccupied = bed.status === 'occupied';
        const canSelect = (isOwner || isManager) && !isOccupied;

        return (
          <TouchableOpacity
            key={bed.id}
            activeOpacity={0.75}
            onPress={() => {
              if (isOccupied) {
                onOccupiedTap(bed.id);
              } else if (canSelect) {
                onToggle(bed.id);
              }
            }}
            style={[
              styles.bedRow,
              {
                borderColor: isSelected
                  ? colors.primary
                  : isOccupied
                  ? semanticColor.error.solid + '40'
                  : colors.border,
                backgroundColor: isSelected
                  ? colors.primary + '12'
                  : isOccupied
                  ? semanticColor.error.solid + '08'
                  : colors.surface,
              },
            ]}
          >
            {/* Selection checkbox */}
            {(isOwner || isManager) && !isOccupied ? (
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => onToggle(bed.id)}
                style={[
                  styles.checkbox,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                  },
                ]}
              >
                {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <View style={[styles.checkbox, { borderColor: 'transparent' }]} />
            )}

            {/* Bed label */}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                {bed.bed_no}
              </Text>
              {isOccupied && bed.tenant_name ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                  Resident: {bed.tenant_name}
                </Text>
              ) : null}
            </View>

            {/* Status pill */}
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isOccupied
                    ? semanticColor.error.solid + '18'
                    : '#10B981' + '18',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                  color: isOccupied ? semanticColor.error.solid : '#10B981',
                }}
              >
                {bed.status.toUpperCase()}
              </Text>
            </View>

            {/* Quick Assign Action for Vacant Beds */}
            {!isOccupied && (isOwner || isManager) ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={(e) => {
                  e.stopPropagation?.();
                  onQuickAssign(bed.id);
                }}
                style={[styles.quickAssignBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '12' }]}
              >
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Assign</Text>
              </TouchableOpacity>
            ) : null}

            {/* Chevron for occupied beds */}
            {isOccupied ? (
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ── Main UnitDetail ──────────────────────────────────────────────────────────
export const UnitDetail: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { id } = route.params;
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();

  const queryClient = useQueryClient();
  const isOwner = user?.role?.name === 'owner';
  const isManager = user?.role?.name === 'manager';

  const [selectedBeds, setSelectedBeds] = useState<number[]>([]);
  const [occupiedBedId, setOccupiedBedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Assign modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignTargetBedIds, setAssignTargetBedIds] = useState<number[]>([]);
  const [assignSelectedTenantId, setAssignSelectedTenantId] = useState<number | null>(null);

  // ⚠️ All hooks before conditional returns (Rules of Hooks)
  const { maskAmount } = useFinancialMask();

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

  const {
    data: beds = [],
    isLoading: isBedsLoading,
  } = useQuery<BedItem[]>({
    queryKey: ['unit-beds', id],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${id}/beds`);
      return res.data;
    },
    enabled: !!unit,
  });

  const { data: unitTenancies = [] } = useQuery<any[]>({
    queryKey: ['unit-tenancies', id],
    queryFn: async () => {
      const res = await apiClient.get('/tenancies');
      return Array.isArray(res.data)
        ? res.data.filter((t: any) => t.unit_id === id && t.status === 'active')
        : [];
    },
    enabled: !!unit,
  });

  const { data: allTenants = [] } = useQuery<any[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const res = await apiClient.get('/tenants');
      return res.data;
    },
    enabled: isOwner || isManager,
  });

  // Build bedId → tenancy lookup
  const bedTenancyMap: Record<number, any> = {};
  for (const tenancy of unitTenancies) {
    if (Array.isArray(tenancy.bed_ids)) {
      for (const bid of tenancy.bed_ids) bedTenancyMap[bid] = tenancy;
    }
  }

  // Build tenantId → tenantName lookup
  const tenantNameMap: Record<number, string> = {};
  for (const t of allTenants) {
    tenantNameMap[t.id] = t.name;
  }

  // Combine beds endpoint data and eager unit.beds payload to guarantee zero truncation
  const rawBeds: BedItem[] = beds.length > 0 ? beds : (unit?.beds || []);

  // Enrich bed items with resident tenant names
  const enrichedBeds: BedItem[] = rawBeds.map((b) => {
    const tenancy = bedTenancyMap[b.id];
    const tenantName = tenancy
      ? tenantNameMap[tenancy.tenant_id] || `Tenant #${tenancy.tenant_id}`
      : undefined;
    return {
      ...b,
      tenant_name: tenantName,
      tenant_id: tenancy?.tenant_id,
    };
  });

  const modalTenantId: number | undefined =
    occupiedBedId !== null ? bedTenancyMap[occupiedBedId]?.tenant_id : undefined;

  const { data: modalTenant, isFetching: isModalTenantFetching } = useQuery<any>({
    queryKey: ['tenant', modalTenantId],
    queryFn: async () => {
      const res = await apiClient.get(`/tenants/${modalTenantId}`);
      return res.data;
    },
    enabled: modalTenantId != null,
  });

  // ── Global Reactive Invalidation Helper ────────────────────────────────────
  const invalidateAllSync = () => {
    queryClient.invalidateQueries({ queryKey: ['unit-beds', id] });
    queryClient.invalidateQueries({ queryKey: ['unit', id] });
    queryClient.invalidateQueries({ queryKey: ['unit-tenancies', id] });
    queryClient.invalidateQueries({ queryKey: ['property-units', unit?.property_id] });
    queryClient.invalidateQueries({ queryKey: ['property-units'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    queryClient.invalidateQueries({ queryKey: ['owner-inventory-beds'] });
    queryClient.invalidateQueries({ queryKey: ['owner-inventory-units'] });
  };

  // ── Bed assignment mutation (single & multi-bed atomic merge) ─────────────
  const assignMutation = useMutation({
    mutationFn: async ({ bedIds, tenantId }: { bedIds: number[]; tenantId: number }) => {
      const res = await apiClient.post(`/units/${id}/beds/assign`, {
        bed_ids: bedIds,
        tenant_id: tenantId,
      });
      return res.data;
    },
    onSuccess: () => {
      setSelectedBeds([]);
      setAssignModalVisible(false);
      setAssignTargetBedIds([]);
      setAssignSelectedTenantId(null);
      invalidateAllSync();
      Alert.alert('Success', 'Bed(s) successfully assigned to tenant!');
    },
    onError: (err: any) => {
      Alert.alert('Assignment Failed', parseApiError(err).message);
    },
  });

  // ── Vacate mutation (unassign bed & restore to vacant) ─────────────────────
  const vacateMutation = useMutation({
    mutationFn: async (bedIds: number[]) => {
      const res = await apiClient.post(`/units/${id}/beds/vacate`, {
        bed_ids: bedIds,
      });
      return res.data;
    },
    onSuccess: () => {
      setOccupiedBedId(null);
      invalidateAllSync();
      Alert.alert('Success', 'Bed successfully vacated and returned to available inventory.');
    },
    onError: (err: any) => {
      Alert.alert('Vacate Failed', parseApiError(err).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/units/${id}`);
    },
    onSuccess: () => {
      if (unit) queryClient.invalidateQueries({ queryKey: ['property-units', unit.property_id] });
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    Alert.alert(
      'Delete Unit',
      'Are you sure you want to delete this rental unit? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  const handleToggleBed = (bedId: number) => {
    setSelectedBeds((prev) =>
      prev.includes(bedId) ? prev.filter((bid) => bid !== bedId) : [...prev, bedId]
    );
  };

  const openQuickAssignModal = (targetIds: number[]) => {
    setAssignTargetBedIds(targetIds);
    setAssignSelectedTenantId(allTenants[0]?.id || null);
    setAssignModalVisible(true);
  };

  const handleCheckInBeds = (targetIds: number[]) => {
    if (targetIds.length === 0) return;
    const params = {
      propertyId: unit?.property_id,
      unitId: unit?.id,
      bedIds: targetIds,
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

  if (isUnitLoading || (unit && isBedsLoading)) {
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

  // ── Group beds by room_type ────────────────────────────────────────────────
  const bedsByBlock: Record<string, BedItem[]> = {};
  for (const bed of enrichedBeds) {
    const key = bed.room_type || 'UNKNOWN';
    if (!bedsByBlock[key]) bedsByBlock[key] = [];
    bedsByBlock[key].push(bed);
  }
  const blockOrder = ['MASTER_BED', 'COMMON_BED', 'HALL', 'UNKNOWN'];
  const sortedBlockKeys = blockOrder.filter((k) => bedsByBlock[k]?.length > 0);

  const vacantCount = enrichedBeds.filter((b) => b.status === 'vacant').length;
  const occupiedCount = enrichedBeds.filter((b) => b.status === 'occupied').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <View style={styles.header}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center' }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>
              Back
            </Text>
          </TouchableOpacity>
          {isOwner ? (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={{ marginRight: space.lg }}
                onPress={() => navigation.navigate('UnitForm', { propertyId: unit.property_id, id: unit.id })}
              >
                <Text style={{ color: colors.primary, fontSize: font.body.fontSize, fontWeight: '600' }}>
                  Edit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} disabled={deleteMutation.isPending}>
                <Text style={{ color: semanticColor.error.solid, fontSize: font.body.fontSize, fontWeight: '600' }}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 100 }}>
          {/* ── Unit Details Card ──────────────────────────────────────────── */}
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
                  {maskAmount(unit.rent)}
                </Text>
              </View>
              <View style={styles.infoCol}>
                <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Deposit</Text>
                <Text style={[styles.value, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                  {maskAmount(unit.deposit)}
                </Text>
              </View>
            </View>

            {unit.notes ? (
              <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[styles.label, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>Notes</Text>
                <Text style={{ color: colors.text, fontSize: font.body.fontSize, marginTop: 2 }}>{unit.notes}</Text>
              </View>
            ) : null}
          </Card>

          {/* ── Geolocation ────────────────────────────────────────────────── */}
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
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${unit.latitude},${unit.longitude}`
                  );
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  backgroundColor: colors.surface,
                }}
              >
                <Ionicons name="location-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.caption.fontSize }}>
                  Open in Google Maps
                </Text>
              </TouchableOpacity>
            </Card>
          ) : null}

          {/* ── Bed Inventory — Block Tier Hierarchy ───────────────────────── */}
          {enrichedBeds.length > 0 ? (
            <Card style={{ borderWidth: 1, marginBottom: space.md }}>
              {/* Header row with view toggle */}
              <View style={[styles.titleRow, { marginBottom: space.sm }]}>
                <View>
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                    Bed Inventory Slots
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                    {vacantCount} vacant · {occupiedCount} occupied · {enrichedBeds.length} total beds
                  </Text>
                </View>
                {/* List / Grid toggle */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setViewMode('list')}
                    style={[
                      styles.viewToggle,
                      {
                        borderColor: viewMode === 'list' ? colors.primary : colors.border,
                        backgroundColor: viewMode === 'list' ? colors.primary + '15' : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? colors.primary : colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewMode('grid')}
                    style={[
                      styles.viewToggle,
                      {
                        borderColor: viewMode === 'grid' ? colors.primary : colors.border,
                        backgroundColor: viewMode === 'grid' ? colors.primary + '15' : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons name="grid-outline" size={14} color={viewMode === 'grid' ? colors.primary : colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {viewMode === 'list' ? (
                // ── Grouped Block List (MB / CB / H) ──────────────────────
                <>
                  {sortedBlockKeys.length > 0 ? (
                    sortedBlockKeys.map((blockKey) => (
                      <BedGroupSection
                        key={blockKey}
                        blockKey={blockKey}
                        beds={bedsByBlock[blockKey]}
                        selectedBeds={selectedBeds}
                        onToggle={handleToggleBed}
                        onOccupiedTap={(bedId) => setOccupiedBedId(bedId)}
                        onQuickAssign={(bedId) => openQuickAssignModal([bedId])}
                        isOwner={isOwner}
                        isManager={isManager}
                        colors={colors}
                        font={font}
                        space={space}
                      />
                    ))
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, textAlign: 'center', paddingVertical: space.md }}>
                      No beds generated yet. Edit unit to add bed blocks.
                    </Text>
                  )}

                  {/* Multi-select help hint */}
                  {(isOwner || isManager) && vacantCount > 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                      Select multiple beds to merge into a single tenant agreement
                    </Text>
                  ) : null}
                </>
              ) : (
                // ── Gesture Drag Grid ────────────────────────────────────
                <>
                  <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.sm }}>
                    Long-press a vacant bed and drag onto another to merge for shared check-in.
                  </Text>
                  <BedDragGrid
                    beds={enrichedBeds}
                    selectedBeds={selectedBeds}
                    onToggle={handleToggleBed}
                    onMerge={(bedIds) => {
                      const uniqueIds = Array.from(new Set([...selectedBeds, ...bedIds]));
                      setSelectedBeds(uniqueIds);
                    }}
                    onOccupiedTap={(bedId) => setOccupiedBedId(bedId)}
                  />
                </>
              )}

              {/* Multi-bed selection action bar */}
              {selectedBeds.length > 0 && (isOwner || isManager) ? (
                <View style={[styles.multiActionBar, { borderColor: colors.primary, backgroundColor: colors.primary + '0C' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>
                      {selectedBeds.length} Bed{selectedBeds.length > 1 ? 's' : ''} Selected
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedBeds([])}>
                      <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>Clear</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      label={`Quick Assign (${selectedBeds.length})`}
                      onPress={() => openQuickAssignModal(selectedBeds)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Full Check-In"
                      variant="secondary"
                      onPress={() => handleCheckInBeds(selectedBeds)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          ) : (
            // Unit with no beds
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

      {/* ── Quick Assign Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setAssignModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: 4 }}>
                  Assign Bed{assignTargetBedIds.length > 1 ? 's' : ''}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.md }}>
                  Assigning:{' '}
                  {assignTargetBedIds
                    .map((id) => beds.find((b) => b.id === id)?.bed_no || `#${id}`)
                    .join(', ')}
                </Text>

                <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize, marginBottom: space.xs }}>
                  Select Tenant
                </Text>

                <ScrollView style={{ maxHeight: 180, marginBottom: space.md }}>
                  {allTenants.map((t) => {
                    const isSelected = assignSelectedTenantId === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setAssignSelectedTenantId(t.id)}
                        style={[
                          styles.tenantSelectRow,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary + '15' : colors.surfaceSoft,
                          },
                        ]}
                      >
                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                          size={16}
                          color={isSelected ? colors.primary : colors.textMuted}
                          style={{ marginRight: 8 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                            {t.name}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t.phone}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {allTenants.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, paddingVertical: 12 }}>
                      No tenants registered. Add tenants from the Tenants tab.
                    </Text>
                  ) : null}
                </ScrollView>

                <Button
                  label={assignMutation.isPending ? 'Assigning...' : `Assign ${assignTargetBedIds.length} Bed${assignTargetBedIds.length > 1 ? 's' : ''}`}
                  disabled={!assignSelectedTenantId || assignMutation.isPending}
                  onPress={() => {
                    if (assignSelectedTenantId) {
                      assignMutation.mutate({
                        bedIds: assignTargetBedIds,
                        tenantId: assignSelectedTenantId,
                      });
                    }
                  }}
                  style={{ marginBottom: space.sm }}
                />

                <Button
                  label="Open Full Check-In / Agreement"
                  variant="secondary"
                  onPress={() => {
                    setAssignModalVisible(false);
                    handleCheckInBeds(assignTargetBedIds);
                  }}
                  style={{ marginBottom: space.sm }}
                />

                <TouchableOpacity
                  onPress={() => setAssignModalVisible(false)}
                  style={[styles.modalCloseBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Occupied Bed Resident Info & Vacate Modal ──────────────────────── */}
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
                      {modalTenant.phone}
                      {modalTenant.email ? ` · ${modalTenant.email}` : ''}
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

                {/* Vacate Bed Button */}
                {(isOwner || isManager) && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Vacate Bed',
                        'Are you sure you want to vacate this bed and restore it to available inventory?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Vacate Bed',
                            style: 'destructive',
                            onPress: () => occupiedBedId && vacateMutation.mutate([occupiedBedId]),
                          },
                        ]
                      );
                    }}
                    disabled={vacateMutation.isPending}
                    style={[
                      styles.modalVacateBtn,
                      {
                        backgroundColor: semanticColor.error.solid + '15',
                        borderColor: semanticColor.error.solid + '40',
                      },
                    ]}
                  >
                    <Ionicons name="log-out-outline" size={16} color={semanticColor.error.solid} style={{ marginRight: 6 }} />
                    <Text style={{ color: semanticColor.error.solid, fontWeight: '700', fontSize: font.body.fontSize }}>
                      {vacateMutation.isPending ? 'Vacating...' : 'Vacate Bed'}
                    </Text>
                  </TouchableOpacity>
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  unitTitle: { fontWeight: 'bold' },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { flex: 1 },
  label: { textTransform: 'uppercase' },
  value: { fontWeight: 'bold', marginTop: 2 },
  // Block grouping
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 6,
  },
  bedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginRight: 6,
  },
  quickAssignBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 4,
  },
  viewToggle: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  multiActionBar: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  tenantSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
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
  modalVacateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
  modalCloseBtn: {
    marginTop: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
});
