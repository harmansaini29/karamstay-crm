import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface TenantProfile {
  id: number;
  user_id: number | null;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string;
  owner_notes: string | null;
}

export const TenantDetail: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { id } = route.params;
  const { colors, font, space } = useTheme();

  // Get tenant profile
  const {
    data: tenant,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TenantProfile>({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const res = await apiClient.get(`/tenants/${id}`);
      return res.data;
    },
  });

  // Directly resolve the active tenancy for this specific tenant
  // Uses the tenant_id param so we only get THIS tenant's tenancy (not a random one from invoices)
  const { data: tenancy } = useQuery<any>({
    queryKey: ['tenancy-by-tenant', id],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/tenancies?tenant_id=${id}`);
        // Mock returns a single tenancy object or {} on 404
        if (res.data && res.data.id) return res.data;
        return null;
      } catch {
        return null;
      }
    },
    retry: false,
    enabled: !!tenant,
  });

  // Resolve the unit assigned in the tenancy
  const { data: tenancyUnit } = useQuery<any>({
    queryKey: ['unit', tenancy?.unit_id],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${tenancy!.unit_id}`);
      return res.data;
    },
    enabled: !!tenancy?.unit_id,
  });

  // Resolve the property of that unit
  const { data: tenancyProperty } = useQuery<any>({
    queryKey: ['property', tenancyUnit?.property_id],
    queryFn: async () => {
      const res = await apiClient.get(`/properties/${tenancyUnit!.property_id}`);
      return res.data;
    },
    enabled: !!tenancyUnit?.property_id,
  });

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (isError || !tenant) {
    return (
      <ErrorState message={parseApiError(error || new Error('Tenant not found')).message} onRetry={refetch} />
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const hasActiveTenancy = tenancy?.status === 'active';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('TenantForm', { id: tenant.id })}>
          <Text style={{ color: colors.primary, fontSize: font.body.fontSize, fontWeight: '600' }}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {/* Profile Card */}
        <Card style={{ borderWidth: 1, marginBottom: space.md }}>
          <View style={styles.titleRow}>
            <View>
              <Text style={[styles.name, { color: colors.text, fontSize: font.h2.fontSize }]}>
                {tenant.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginTop: 2 }}>
                {tenant.phone}
              </Text>
            </View>
            <Badge status={tenant.status} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.profileGrid}>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
              <Text style={[styles.val, { color: colors.text }]}>{tenant.email || 'Not provided'}</Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Occupation</Text>
              <Text style={[styles.val, { color: colors.text }]}>{tenant.occupation || 'Not provided'}</Text>
            </View>
          </View>

          <View style={styles.profileGrid}>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Date of Birth</Text>
              <Text style={[styles.val, { color: colors.text }]}>{tenant.date_of_birth || 'Not provided'}</Text>
            </View>
          </View>

          {/* Emergency Contact */}
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.sm }]}>
            Emergency Contact
          </Text>
          <View style={styles.profileGrid}>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
              <Text style={[styles.val, { color: colors.text }]}>{tenant.emergency_contact_name || 'Not provided'}</Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Phone</Text>
              <Text style={[styles.val, { color: colors.text }]}>{tenant.emergency_contact_phone || 'Not provided'}</Text>
            </View>
          </View>

          {/* Owner notes */}
          {tenant.owner_notes ? (
            <View style={{ marginTop: space.md }}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                Owner Notes
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize }}>
                {tenant.owner_notes}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Tenancy Context Card */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginBottom: space.sm, marginTop: space.sm }]}>
          Tenancy Details
        </Text>

        {hasActiveTenancy ? (
          <Card style={{ borderWidth: 1, marginBottom: space.md }}>
            <View style={styles.titleRow}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                Active Rental Contract
              </Text>
              <Badge status="active" />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.profileGrid}>
              <View style={styles.gridCol}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Monthly Rent</Text>
                <Text style={[styles.val, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                  {formatCurrency(tenancy.monthly_rent)}
                </Text>
              </View>
              <View style={styles.gridCol}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Security Deposit</Text>
                <Text style={[styles.val, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                  {formatCurrency(tenancy.security_deposit)}
                </Text>
              </View>
            </View>

            <View style={styles.profileGrid}>
              <View style={styles.gridCol}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Start Date</Text>
                <Text style={[styles.val, { color: colors.text }]}>
                  {tenancy.start_date}
                </Text>
              </View>
              <View style={styles.gridCol}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Billing Day</Text>
                <Text style={[styles.val, { color: colors.text }]}>
                  {tenancy.billing_day} of every month
                </Text>
              </View>
            </View>

            {/* Property & Unit Location */}
            {(tenancyProperty || tenancyUnit) ? (
              <View style={{ marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[styles.label, { color: colors.textMuted, marginBottom: 4 }]}>LOCATION</Text>
                {tenancyProperty ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Ionicons name="business-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
                    <Text style={[styles.val, { color: colors.text }]}>{tenancyProperty.name}</Text>
                  </View>
                ) : null}
                {tenancyUnit ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="home-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
                    <Text style={[styles.val, { color: colors.text }]}>
                      Unit {tenancyUnit.unit_no} · {tenancyUnit.unit_type?.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Assigned Beds */}
            {Array.isArray(tenancy.bed_ids) && tenancy.bed_ids.length > 0 ? (
              <View style={{ marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[styles.label, { color: colors.textMuted, marginBottom: 6 }]}>ASSIGNED BED(S)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {tenancy.bed_ids.map((bid: number) => (
                    <View
                      key={bid}
                      style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 8, marginBottom: 4 }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Bed #{bid}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={[styles.buttonRow, { marginTop: space.md }]}>
              <Button
                label="Check Ledger"
                onPress={() => navigation.navigate('Finance', { screen: 'Ledger', params: { tenancyId: tenancy.id } })}
                variant="secondary"
                style={{ flex: 1, marginRight: space.sm }}
              />
              <Button
                label="Check-out"
                onPress={() => navigation.navigate('CheckOutForm', { tenancyId: tenancy.id })}
                variant="destructive"
                style={{ flex: 1, marginLeft: space.sm }}
              />
            </View>
          </Card>
        ) : (
          <Card style={{ borderWidth: 1, alignItems: 'center', padding: space.xl }}>
            <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginBottom: space.md }}>
              No active tenancy contract for this tenant.
            </Text>
            <Button
              label="Check-in Tenant"
              onPress={() => navigation.navigate('CheckInForm', { tenantId: tenant.id })}
              style={{ width: 180 }}
            />
          </Card>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  profileGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gridCol: {
    width: '48%',
  },
  label: {
    fontSize: 12,
    marginBottom: 2,
  },
  val: {
    fontWeight: '500',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
