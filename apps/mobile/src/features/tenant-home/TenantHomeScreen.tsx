import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';

export const TenantHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();
  const { user } = useAuth();

  const [refreshing, setRefreshing] = useState(false);

  // 1. Fetch tenant tenancy context (GET /tenancies/me)
  const { data: tenancyContext, isLoading: isContextLoading, refetch: refetchContext } = useQuery<any>({
    queryKey: ['my-tenancy'],
    queryFn: async () => {
      const res = await apiClient.get('/tenancies/me');
      return res.data;
    },
  });

  // 2. Fetch tenant invoices to display the rent due card
  const { data: invoices = [], isLoading: isInvoicesLoading, refetch: refetchInvoices } = useQuery<any[]>({
    queryKey: ['my-invoices'],
    queryFn: async () => {
      const res = await apiClient.get('/invoices');
      return res.data;
    },
  });

  // 3. Fetch announcements / notices scopes (notifications)
  const { data: notices = [], refetch: refetchNotices } = useQuery<any[]>({
    queryKey: ['my-notices'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications');
      return res.data.slice(0, 3);
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchContext(), refetchInvoices(), refetchNotices()]);
    setRefreshing(false);
  };

  // Payment is handled entirely by the UPI + UTR flow on the Payments tab — the home
  // screen just routes there with the specific invoice so the tenant lands on it.
  const goToPay = (invoice: any) => {
    navigation.navigate('Payments', { focusInvoiceId: invoice.id });
  };

  if (isContextLoading || isInvoicesLoading) {
    return <LoadingSkeleton variant="dashboard" />;
  }

  // Find most recent pending/overdue invoice
  const dueInvoices = invoices.filter(
    (inv) => inv.status === 'pending' || inv.status === 'overdue' || inv.status === 'partial'
  );
  dueInvoices.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  const activeDueInvoice = dueInvoices[0];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Welcome Header */}
        <View style={styles.header}>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, fontWeight: 'bold' }}>
            WELCOME HOME
          </Text>
          <Text style={{ color: colors.text, fontSize: font.h1.fontSize, fontWeight: 'bold' }}>
            {user?.name}
          </Text>
        </View>

        {/* Tenancy Context Card */}
        {tenancyContext && tenancyContext.unit ? (
          <Card style={[styles.unitCard, { borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="business" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  {tenancyContext.unit.property_name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                  {tenancyContext.unit.building} · Unit {tenancyContext.unit.unit_no} ({tenancyContext.unit.floor})
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Rent Due Card */}
        {activeDueInvoice ? (
          <Card style={[styles.dueCard, { borderColor: colors.border }]}>
            <View style={styles.dueHeader}>
              <View>
                <Text style={{ color: '#B45309', fontSize: 11, fontWeight: 'bold' }}>RENT OUTSTANDING</Text>
                <Text style={[styles.dueAmount, { color: colors.text, fontSize: font.h1.fontSize }]}>
                  {formatCurrency(Number(activeDueInvoice.amount) + Number(activeDueInvoice.late_fee_amount))}
                </Text>
              </View>
              <Badge status={activeDueInvoice.status} />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: space.sm }}>
              Billing Cycle: {activeDueInvoice.billing_period} · Due date: {activeDueInvoice.due_date}
            </Text>
            
            <Button
              label="Pay via UPI"
              onPress={() => goToPay(activeDueInvoice)}
              style={{ marginTop: space.md }}
            />
          </Card>
        ) : (
          <Card style={[styles.settledCard, { borderColor: '#10B98120', backgroundColor: '#ECFDF550' }]}>
            <Ionicons name="checkmark-circle" size={32} color="#10B981" />
            <Text style={{ color: '#047857', fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginTop: space.sm }}>
              Rent fully paid for this cycle!
            </Text>
            <Text style={{ color: '#047857', fontSize: font.caption.fontSize, textAlign: 'center', marginTop: 2 }}>
              No outstanding dues are currently pending.
            </Text>
          </Card>
        )}

        {/* Notices list */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginTop: space.lg, marginBottom: space.sm }]}>
          Building Announcements
        </Text>
        
        {notices.length === 0 ? (
          <Card style={{ padding: space.md, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>No recent announcements</Text>
          </Card>
        ) : (
          notices.map((notice) => (
            <Card key={notice.id} style={[styles.noticeCard, { borderColor: colors.border, marginBottom: space.sm }]}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                {notice.title}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 4 }}>
                {notice.message}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 8 }}>
                {new Date(notice.created_at).toLocaleDateString()}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 20,
  },
  unitCard: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueCard: {
    borderWidth: 1,
    padding: 16,
  },
  dueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dueAmount: {
    fontWeight: 'bold',
    marginTop: 4,
  },
  settledCard: {
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  noticeCard: {
    borderWidth: 1,
    padding: 12,
  },
});
