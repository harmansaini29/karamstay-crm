import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

type SubTab = 'invoices' | 'payments' | 'expenses' | 'reports';

export const FinanceHome: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAccountant = user?.role?.name === 'accountant';
  const isOwner = user?.role?.name === 'owner';
  const isManager = user?.role?.name === 'manager';
  const canMutate = isOwner || isManager || isAccountant;

  const [activeTab, setActiveTab] = useState<SubTab>('invoices');

  // Filter states
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);

  // Queries
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await apiClient.get('/properties');
      return res.data;
    },
  });

  const { data: invoices = [], isLoading: isInvoicesLoading, refetch: refetchInvoices } = useQuery<any[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      const res = await apiClient.get('/invoices');
      return res.data;
    },
  });

  const { data: payments = [], isLoading: isPaymentsLoading, refetch: refetchPayments } = useQuery<any[]>({
    queryKey: ['payments'],
    queryFn: async () => {
      const res = await apiClient.get('/payments');
      return res.data;
    },
  });

  const { data: expenses = [], isLoading: isExpensesLoading, refetch: refetchExpenses } = useQuery<any[]>({
    queryKey: ['expenses', selectedPropertyId],
    queryFn: async () => {
      const url = selectedPropertyId ? `/expenses?property_id=${selectedPropertyId}` : '/expenses';
      const res = await apiClient.get(url);
      return res.data;
    },
  });

  const handleExportReport = async (path: string, name: string) => {
    try {
      const url = `${apiClient.defaults.baseURL}/reports/${path}?export_format=pdf`;

      Alert.alert('Downloading Report', 'Please wait while the PDF document is compiled and downloaded...');

      const accessToken = apiClient.defaults.headers.common['Authorization'];

      const destination = new File(Paths.document, `${name}.pdf`);
      const task = File.createDownloadTask(url, destination, {
        headers: {
          Authorization: accessToken ? String(accessToken) : '',
        },
      });

      const file = await task.downloadAsync();

      if (file && file.uri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri);
        } else {
          Alert.alert('Downloaded', `PDF report saved to: ${file.uri}`);
        }
      } else {
        throw new Error('Download task failed to return file');
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Unable to download report');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderInvoiceItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigation.navigate('InvoiceDetail', { id: item.id })}
      style={{ marginBottom: space.sm }}
    >
      <Card style={styles.listCard}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              Invoice #{item.id}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Period: {item.billing_period} · Due: {item.due_date}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.xs }}>
              {formatCurrency(item.amount)}
            </Text>
            <Badge status={item.status} />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderPaymentItem = ({ item }: { item: any }) => (
    <Card style={[styles.listCard, { marginBottom: space.sm }]}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
            Payment #{item.id}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
            Mode: {item.mode.toUpperCase()} · Date: {item.paid_at ? new Date(item.paid_at).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.xs }}>
            {formatCurrency(item.amount)}
          </Text>
          <Badge status={item.status} />
        </View>
      </View>
    </Card>
  );

  const renderExpenseItem = ({ item }: { item: any }) => (
    <Card style={[styles.listCard, { marginBottom: space.sm }]}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
            {item.category}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
            {item.description || 'No description'} · Date: {item.expense_date}
          </Text>
        </View>
        <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
          -{formatCurrency(item.amount)}
        </Text>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
            FINANCIAL CENTER
          </Text>
          <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
            Finance
          </Text>
        </View>
        {canMutate && activeTab === 'invoices' ? (
          <Button
            label="Create Invoice"
            onPress={() => navigation.navigate('CreateInvoice')}
            size="compact"
            style={{ width: 120 }}
          />
        ) : null}
        {canMutate && activeTab === 'expenses' ? (
          <Button
            label="Record Expense"
            onPress={() => navigation.navigate('CreateExpense')}
            size="compact"
            style={{ width: 120 }}
          />
        ) : null}
      </View>

      {/* Segmented Sub Tabs */}
      <View style={[styles.segmentedContainer, { borderColor: colors.border }]}>
        {(['invoices', 'payments', 'expenses', 'reports'] as SubTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.segmentButton,
              {
                backgroundColor: activeTab === tab ? colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                color: activeTab === tab ? '#FFFFFF' : colors.textMuted,
                fontWeight: '600',
                fontSize: 12,
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Active Tab Screen */}
      <View style={{ flex: 1 }}>
        {activeTab === 'invoices' ? (
          <FlatList
            data={invoices}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderInvoiceItem}
            contentContainerStyle={{ padding: space.lg }}
            ListEmptyComponent={
              <EmptyState
                title="No Invoices Found"
                body="Invoices generated for check-ins and monthly cycles will appear here."
              />
            }
            refreshing={isInvoicesLoading}
            onRefresh={refetchInvoices}
          />
        ) : null}

        {activeTab === 'payments' ? (
          <FlatList
            data={payments}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderPaymentItem}
            contentContainerStyle={{ padding: space.lg }}
            ListEmptyComponent={
              <EmptyState title="No Payments Sighted" body="Rent payments processed will be logged here." />
            }
            refreshing={isPaymentsLoading}
            onRefresh={refetchPayments}
          />
        ) : null}

        {activeTab === 'expenses' ? (
          <FlatList
            data={expenses}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderExpenseItem}
            contentContainerStyle={{ padding: space.lg }}
            ListEmptyComponent={
              <EmptyState title="No Expenses Logged" body="Record recurring operational costs here." />
            }
            refreshing={isExpensesLoading}
            onRefresh={refetchExpenses}
          />
        ) : null}

        {activeTab === 'reports' ? (
          <ScrollView contentContainerStyle={{ padding: space.lg }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: space.md }}>
              Export Reports (PDF Format)
            </Text>

            <TouchableOpacity
              style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleExportReport('occupancy', 'occupancy_report')}
            >
              <View style={[styles.reportIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="pie-chart" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  Occupancy Report
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                  Occupancy rates across rental portfolios
                </Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleExportReport('revenue', 'revenue_report')}
            >
              <View style={[styles.reportIcon, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="cash" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  Revenue Report
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                  Summary of collected rents and invoices
                </Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleExportReport('pending-dues', 'defaulters_report')}
            >
              <View style={[styles.reportIcon, { backgroundColor: '#F59E0B15' }]}>
                <Ionicons name="alert-circle" size={20} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  Pending Dues / Defaulters
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                  Overdue invoices and outstanding balances
                </Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleExportReport('maintenance-cost', 'maintenance_costs')}
            >
              <View style={[styles.reportIcon, { backgroundColor: '#EF444415' }]}>
                <Ionicons name="build" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  Maintenance Costs
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                  Expenses categorized by ticket resolutions
                </Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </View>
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
  segmentedContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  listCard: {
    borderWidth: 1,
    padding: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  reportIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
});
