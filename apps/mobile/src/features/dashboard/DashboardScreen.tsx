import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { Ionicons } from '@expo/vector-icons';
import { useFinancialMask } from '../../hooks/useFinancialMask';

interface Property {
  id: number;
  name: string;
  address: string;
}

interface DashboardAnalytics {
  property_id: number | null;
  occupancy_rate: number;
  revenue_this_month: number;
  pending_dues_total: number;
  open_maintenance_tickets: number;
  upcoming_move_ins: number;
  upcoming_move_outs: number;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  status: string;
  created_at: string;
}

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius, shadows, isDark } = useTheme();
  const { user } = useAuth();
  const isManager = user?.role?.name === 'manager';
  const isStaff = user?.role?.name === 'staff';

  // Staff do not have a Finance tab — silently no-op instead of throwing
  // 'The action NAVIGATE with payload {name:Finance} was not handled'
  const navigateToFinance = () => {
    if (!isStaff) navigation.navigate('Finance');
  };

  // Financial masking: staff see '••••' on revenue/dues tiles
  const { maskAmount } = useFinancialMask();

  const activeTileShadow = isDark
    ? { ...shadows.sm, shadowColor: '#000000', shadowOpacity: 0.15 }
    : shadows.sm;
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  // Queries
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await apiClient.get('/properties');
      return res.data;
    },
  });

  const {
    data: analytics,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery<DashboardAnalytics>({
    queryKey: ['analytics', selectedPropertyId],
    queryFn: async () => {
      const url = selectedPropertyId
        ? `/analytics/dashboard?property_id=${selectedPropertyId}`
        : '/analytics/dashboard';
      const res = await apiClient.get(url);
      return res.data;
    },
    enabled: !isManager, // Avoid unauthorized calls for managers
  });

  // Manager-specific queries
  const {
    data: tickets = [],
    isLoading: isTicketsLoading,
    refetch: refetchTickets,
  } = useQuery<any[]>({
    queryKey: ['maintenance-tickets-dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/maintenance-tickets');
      return res.data;
    },
    enabled: isManager,
  });

  const {
    data: unitsList = [],
    isLoading: isUnitsLoading,
    refetch: refetchUnits,
  } = useQuery<any[]>({
    queryKey: ['manager-units-dashboard', properties],
    queryFn: async () => {
      if (properties.length === 0) return [];
      const allUnits: any[] = [];
      // If a property is selected, only fetch that one
      const targetProps = selectedPropertyId
        ? properties.filter(p => p.id === selectedPropertyId)
        : properties;

      for (const p of targetProps) {
        try {
          const res = await apiClient.get(`/properties/${p.id}/units`);
          allUnits.push(...res.data);
        } catch (e) {}
      }
      return allUnits;
    },
    enabled: isManager && properties.length > 0,
  });

  const {
    data: bedsList = [],
    isLoading: isBedsLoading,
    refetch: refetchBeds,
  } = useQuery<any[]>({
    queryKey: ['manager-beds-dashboard', unitsList],
    queryFn: async () => {
      const allBeds: any[] = [];
      const multiUnits = unitsList.filter(u => u.capacity > 1);
      for (const u of multiUnits) {
        try {
          const res = await apiClient.get(`/units/${u.id}/beds`);
          allBeds.push(...res.data);
        } catch (e) {}
      }
      return allBeds;
    },
    enabled: isManager && unitsList.length > 0,
  });

  // Owner / Accountant inventory queries (mirrors manager, gated by !isManager)
  const {
    data: ownerUnitsList = [],
    refetch: refetchOwnerUnits,
  } = useQuery<any[]>({
    queryKey: ['owner-inventory-units', selectedPropertyId, properties.length],
    queryFn: async () => {
      const allUnits: any[] = [];
      const targetProps = selectedPropertyId
        ? properties.filter((p) => p.id === selectedPropertyId)
        : properties;
      for (const p of targetProps) {
        try {
          const res = await apiClient.get(`/properties/${p.id}/units`);
          allUnits.push(...res.data);
        } catch (e) {}
      }
      return allUnits;
    },
    enabled: !isManager && properties.length > 0,
  });

  const {
    data: ownerBedsList = [],
    refetch: refetchOwnerBeds,
  } = useQuery<any[]>({
    queryKey: ['owner-inventory-beds', ownerUnitsList.length, selectedPropertyId],
    queryFn: async () => {
      const allBeds: any[] = [];
      const multiUnits = ownerUnitsList.filter((u) => (u.capacity || 1) > 1);
      for (const u of multiUnits) {
        try {
          const res = await apiClient.get(`/units/${u.id}/beds`);
          allBeds.push(...res.data);
        } catch (e) {}
      }
      return allBeds;
    },
    enabled: !isManager && ownerUnitsList.length > 0,
  });

  const { data: notifications = [], refetch: refetchNotifications } = useQuery<NotificationItem[]>({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications');
      return res.data.slice(0, 3); // top 3
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    if (isManager) {
      await Promise.all([refetchTickets(), refetchUnits(), refetchBeds(), refetchNotifications()]);
    } else {
      await Promise.all([refetchAnalytics(), refetchOwnerUnits(), refetchOwnerBeds(), refetchNotifications()]);
    }
    setRefreshing(false);
  };

  if ((!isManager && isAnalyticsLoading) || (isManager && (isTicketsLoading || isUnitsLoading || isBedsLoading))) {
    return <LoadingSkeleton variant="dashboard" />;
  }

  if (!isManager && isAnalyticsError) {
    return (
      <ErrorState
        message={parseApiError(analyticsError).message}
        onRetry={onRefresh}
      />
    );
  }

  const selectedPropertyName =
    properties.find((p) => p.id === selectedPropertyId)?.name || 'All Properties';

  const formatCurrency = (amount: number) => {
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function') {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(amount);
      }
    } catch (e) {}
    // Fallback if Intl is broken on device
    return '₹' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Manager metrics computing
  // Filter tickets by selected property units if applicable
  const filteredTickets = selectedPropertyId
    ? tickets.filter(t => {
        const unit = unitsList.find(u => u.id === t.unit_id);
        return unit && unit.property_id === selectedPropertyId;
      })
    : tickets;

  const openTicketsCount = filteredTickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const closedTicketsCount = filteredTickets.filter(t => t.status === 'completed' || t.status === 'resolved' || t.status === 'closed').length;

  const vacantFlats = unitsList.filter(u => u.capacity === 1 && u.status === 'vacant').length;
  const occupiedFlats = unitsList.filter(u => u.capacity === 1 && u.status === 'occupied').length;

  const vacantBeds = bedsList.filter(b => b.status === 'vacant').length;
  const occupiedBeds = bedsList.filter(b => b.status === 'occupied').length;

  // Owner / Accountant bed inventory computations
  const ownerVacantFlats = ownerUnitsList.filter((u) => (u.capacity || 1) === 1 && u.status === 'vacant').length;
  const ownerOccupiedFlats = ownerUnitsList.filter((u) => (u.capacity || 1) === 1 && u.status === 'occupied').length;
  const ownerTotalBeds = ownerBedsList.length;
  const ownerVacantBeds = ownerBedsList.filter((b) => b.status === 'vacant').length;
  const ownerOccupiedBeds = ownerBedsList.filter((b) => b.status === 'occupied').length;

  const statTiles = [
    {
      title: 'Occupancy',
      value: `${Math.round((analytics?.occupancy_rate || 0) * 100)}%`,
      icon: 'people-circle-sharp',
      color: colors.primary,
      onPress: () => navigation.navigate('Properties'),
    },
    {
      title: 'Revenue (Month)',
      value: maskAmount(analytics?.revenue_this_month || 0),
      icon: 'cash-outline',
      color: semanticColor.success.solid,
      onPress: navigateToFinance,
    },
    {
      title: 'Pending Dues',
      value: maskAmount(analytics?.pending_dues_total || 0),
      icon: 'alert-circle-outline',
      color: semanticColor.warning.solid,
      onPress: navigateToFinance,
    },
    {
      title: 'Open Tickets',
      value: String(analytics?.open_maintenance_tickets || 0),
      icon: 'construct-outline',
      color: semanticColor.error.solid,
      onPress: () => navigation.navigate('More', { screen: 'Maintenance' }),
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: 90 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* Header and Picker */}
          <View style={styles.header}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
              {isManager ? 'MANAGER DASHBOARD' : 'KARAMSTAY OWNER'}
            </Text>
            <Text style={[styles.title, { color: colors.text, fontSize: font.h1.fontSize }]}>
              Dashboard
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowPropertyPicker(!showPropertyPicker)}
          >
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize, marginRight: space.xs }}>
              {selectedPropertyName}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.text} />
          </TouchableOpacity>
          </View>

          {/* Dropdown list */}
          {showPropertyPicker ? (
          <Card style={{ marginBottom: space.md, padding: space.sm }}>
            <TouchableOpacity
              style={[styles.pickerItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setSelectedPropertyId(null);
                setShowPropertyPicker(false);
              }}
            >
              <Text style={{ color: selectedPropertyId === null ? colors.primary : colors.text, fontWeight: selectedPropertyId === null ? 'bold' : 'normal' }}>
                All Properties
              </Text>
            </TouchableOpacity>
            {properties.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setSelectedPropertyId(p.id);
                  setShowPropertyPicker(false);
                }}
              >
                <Text style={{ color: selectedPropertyId === p.id ? colors.primary : colors.text, fontWeight: selectedPropertyId === p.id ? 'bold' : 'normal' }}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </Card>
          ) : null}

          {isManager ? (
          // MANAGER RESTRICTED LAYOUT
          <View>
            {/* Maintenance Tickets Section */}
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
              Maintenance Work orders
            </Text>
            <View style={styles.statsGrid}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Maintenance')}
                style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border, width: '48%', ...activeTileShadow }]}
              >
                <View style={[styles.iconContainer, { backgroundColor: semanticColor.error.solid + '15' }]}>
                  <Ionicons name="construct-outline" size={24} color={semanticColor.error.solid} />
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
                  Open / Pending
                </Text>
                <Text style={[styles.statValue, { color: colors.text, fontSize: font.h2.fontSize }]}>
                  {openTicketsCount}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Maintenance')}
                style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border, width: '48%', ...activeTileShadow }]}
              >
                <View style={[styles.iconContainer, { backgroundColor: semanticColor.success.solid + '15' }]}>
                  <Ionicons name="checkmark-done" size={24} color={semanticColor.success.solid} />
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
                  Fixed / Closed
                </Text>
                <Text style={[styles.statValue, { color: colors.text, fontSize: font.h2.fontSize }]}>
                  {closedTicketsCount}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inventory Section */}
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginTop: space.sm }]}>
              Property Occupancy & Vacancy
            </Text>
            <Card style={{ borderWidth: 1, padding: 16, marginBottom: 16 }}>
              {/* Flats stats */}
              <View style={styles.inventoryRow}>
                <View style={styles.inventoryItemLabel}>
                  <Ionicons name="business-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                    Single Flats (Private)
                  </Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.success.bg, marginRight: 8 }]}>
                    <Text style={{ color: semanticColor.success.fg, fontWeight: 'bold', fontSize: 12 }}>
                      {vacantFlats} Vacant
                    </Text>
                  </View>
                  <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.info.bg }]}>
                    <Text style={{ color: semanticColor.info.fg, fontWeight: 'bold', fontSize: 12 }}>
                      {occupiedFlats} Occupied
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Shared beds stats */}
              <View style={styles.inventoryRow}>
                <View style={styles.inventoryItemLabel}>
                  <Ionicons name="bed-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                    Shared Beds (Co-living)
                  </Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.success.bg, marginRight: 8 }]}>
                    <Text style={{ color: semanticColor.success.fg, fontWeight: 'bold', fontSize: 12 }}>
                      {vacantBeds} Vacant
                    </Text>
                  </View>
                  <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.info.bg }]}>
                    <Text style={{ color: semanticColor.info.fg, fontWeight: 'bold', fontSize: 12 }}>
                      {occupiedBeds} Occupied
                    </Text>
                  </View>
                </View>
              </View>
            </Card>
          </View>
          ) : (
          // OWNER/ACCOUNTANT FULL LAYOUT
          <View>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              {statTiles.map((tile, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPress={tile.onPress}
                  style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border, width: '48%', ...activeTileShadow }]}
                >
                  <View style={[styles.iconContainer, { backgroundColor: tile.color + '15' }]}>
                    <Ionicons name={tile.icon as any} size={24} color={tile.color} />
                  </View>
                  <Text style={[styles.statLabel, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
                    {tile.title}
                  </Text>
                  <Text style={[styles.statValue, { color: colors.text, fontSize: font.h2.fontSize }]}>
                    {tile.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Bed Inventory Overview — Owner/Accountant */}
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginTop: space.sm }]}>
              Bed & Unit Inventory
            </Text>
            <Card style={{ borderWidth: 1, padding: 16, marginBottom: 16 }}>
              {/* Single Flats */}
              <View style={styles.inventoryRow}>
                <View style={styles.inventoryItemLabel}>
                  <Ionicons name="business-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>Single Flats</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.success.bg, marginRight: 8 }]}>
                    <Text style={{ color: semanticColor.success.fg, fontWeight: 'bold', fontSize: 12 }}>{ownerVacantFlats} Vacant</Text>
                  </View>
                  <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.info.bg }]}>
                    <Text style={{ color: semanticColor.info.fg, fontWeight: 'bold', fontSize: 12 }}>{ownerOccupiedFlats} Occupied</Text>
                  </View>
                </View>
              </View>

              {ownerTotalBeds > 0 ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  {/* Shared Beds */}
                  <View style={styles.inventoryRow}>
                    <View style={styles.inventoryItemLabel}>
                      <Ionicons name="bed-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                      <View>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>Shared Beds</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{ownerTotalBeds} total beds</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                      <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.success.bg, marginRight: 8 }]}>
                        <Text style={{ color: semanticColor.success.fg, fontWeight: 'bold', fontSize: 12 }}>{ownerVacantBeds} Vacant</Text>
                      </View>
                      <View style={[styles.inventoryBadge, { backgroundColor: semanticColor.info.bg }]}>
                        <Text style={{ color: semanticColor.info.fg, fontWeight: 'bold', fontSize: 12 }}>{ownerOccupiedBeds} Occupied</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : null}
            </Card>

            {/* Quick Actions Row */}
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginTop: space.sm }]}>
              Quick Actions
            </Text>
            <Card style={styles.quickActionsCard}>
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={styles.quickActionItem}
                  onPress={() => navigation.navigate('Tenants')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: colors.primary }]}>
                    <Ionicons name="person-add" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: font.caption.fontSize }]}>
                    Check-in
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.quickActionItem}
                  onPress={navigateToFinance}
                >
                  <View style={[styles.actionIcon, { backgroundColor: semanticColor.success.solid }]}>
                    <Ionicons name="receipt" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: font.caption.fontSize }]}>
                    Invoice
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionItem}
                  onPress={navigateToFinance}
                >
                  <View style={[styles.actionIcon, { backgroundColor: semanticColor.warning.solid }]}>
                    <Ionicons name="wallet" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: font.caption.fontSize }]}>
                    Expense
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionItem}
                  onPress={() => navigation.navigate('Properties')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: colors.primary }]}>
                    <Ionicons name="business" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text, fontSize: font.caption.fontSize }]}>
                    Add Unit
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
          )}

          {/* Notifications Preview */}
          <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginBottom: 0 }]}>
            Recent Notifications
          </Text>
          <TouchableOpacity onPress={() => {
            if (isManager) navigation.navigate('Profile', { screen: 'Notifications' });
            else navigation.navigate('More', { screen: 'Notifications' });
          }}>
            <Text style={{ color: colors.primary, fontSize: font.caption.fontSize, fontWeight: '600' }}>
              See all
            </Text>
          </TouchableOpacity>
          </View>

          {notifications.length === 0 ? (
          <Card style={{ padding: space.md, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>No recent alerts</Text>
          </Card>
          ) : (
          notifications.map((notif) => (
            <Card key={notif.id} style={[styles.notifCard, { marginBottom: space.sm, padding: space.md, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  {notif.title}
                </Text>
                <Badge status={notif.status === 'read' ? 'vacant' : 'pending'} />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                {notif.message}
              </Text>
            </Card>
          ))
          )}
        </ScrollView>
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
    marginBottom: 20,
  },
  welcomeText: {
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  title: {
    fontWeight: 'bold',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statTile: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    marginBottom: 4,
  },
  statValue: {
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  quickActionsCard: {
    padding: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    alignItems: 'center',
    width: '23%',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  notifCard: {
    borderWidth: 1,
  },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  inventoryItemLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inventoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  divider: {
    height: 1,
  },
});
