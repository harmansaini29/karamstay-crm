import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface Invoice {
  id: number;
  tenancy_id: number;
  billing_period: string;
  due_date: string;
  amount: number;
  late_fee_amount: number;
  status: string;
}

export const InvoiceDetail: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { id } = route.params;
  const { colors, font, space } = useTheme();

  const {
    data: invoice,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await apiClient.get(`/invoices/${id}`);
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (isError || !invoice) {
    return (
      <ErrorState message={parseApiError(error || new Error('Invoice not found')).message} onRetry={refetch} />
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalAmount = Number(invoice.amount) + Number(invoice.late_fee_amount);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Invoice #{invoice.id}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Card style={{ borderWidth: 1, marginBottom: space.md }}>
          <View style={styles.titleRow}>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>BILLING PERIOD</Text>
              <Text style={[styles.periodText, { color: colors.text, fontSize: font.h2.fontSize }]}>
                {invoice.billing_period}
              </Text>
            </View>
            <Badge status={invoice.status} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize }}>Due Date</Text>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.bodyStrong.fontSize }}>
              {invoice.due_date}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize }}>Rent Amount</Text>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.bodyStrong.fontSize }}>
              {formatCurrency(invoice.amount)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize }}>Late Fees Accrued</Text>
            <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: font.bodyStrong.fontSize }}>
              {formatCurrency(invoice.late_fee_amount)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={[styles.infoRow, { marginBottom: 0 }]}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>Total Due</Text>
            <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.h2.fontSize }}>
              {formatCurrency(totalAmount)}
            </Text>
          </View>
        </Card>

        {/* Quick Links */}
        <Card style={{ borderWidth: 1 }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.md }}>
            Quick Links
          </Text>
          
          <TouchableOpacity
            style={[styles.linkRow, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('Tenants', { screen: 'TenantDetail', params: { id: invoice.tenancy_id } })}
          >
            <Ionicons name="person-outline" size={20} color={colors.primary} style={{ marginRight: space.sm }} />
            <Text style={{ color: colors.text, fontSize: font.body.fontSize, flex: 1 }}>View Linked Tenant Profile</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('Ledger', { tenancyId: invoice.tenancy_id })}
          >
            <Ionicons name="journal-outline" size={20} color={colors.primary} style={{ marginRight: space.sm }} />
            <Text style={{ color: colors.text, fontSize: font.body.fontSize, flex: 1 }}>View Contract Ledger History</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
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
  headerTitle: {
    fontWeight: 'bold',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodText: {
    fontWeight: 'bold',
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
});
