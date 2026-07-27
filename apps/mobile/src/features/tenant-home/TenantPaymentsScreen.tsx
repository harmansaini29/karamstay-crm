import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, AppState, Modal, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useAuth } from '../auth/AuthContext';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

type FinanceTab = 'invoices' | 'payments' | 'ledger';

export const TenantPaymentsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FinanceTab>('invoices');
  
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState('');

  // UPI checkout states
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [upiModalVisible, setUpiModalVisible] = useState(false);
  const [utrModalVisible, setUtrModalVisible] = useState(false);
  const [utrCode, setUtrCode] = useState('');
  const [utrError, setUtrError] = useState('');

  const appState = useRef(AppState.currentState);
  const [isWaitingForUtr, setIsWaitingForUtr] = useState(false);

  // 1. Fetch tenancy to get tenancy ID
  const { data: tenancyContext } = useQuery<any>({
    queryKey: ['my-tenancy'],
    queryFn: async () => {
      const res = await apiClient.get('/tenancies/me');
      return res.data;
    },
  });

  const tenancyId = tenancyContext?.id;

  // 2. Fetch invoices (own)
  const { data: invoices = [], isLoading: isInvoicesLoading, refetch: refetchInvoices } = useQuery<any[]>({
    queryKey: ['my-invoices'],
    queryFn: async () => {
      const res = await apiClient.get('/invoices');
      return res.data;
    },
  });

  // 3. Fetch payments (own)
  const { data: payments = [], isLoading: isPaymentsLoading, refetch: refetchPayments } = useQuery<any[]>({
    queryKey: ['my-payments'],
    queryFn: async () => {
      const res = await apiClient.get('/payments');
      return res.data;
    },
  });

  // 4. Fetch ledger entries
  const { data: ledger = [], isLoading: isLedgerLoading, refetch: refetchLedger } = useQuery<any[]>({
    queryKey: ['my-ledger', tenancyId],
    queryFn: async () => {
      if (!tenancyId) return [];
      const res = await apiClient.get(`/ledger?tenancy_id=${tenancyId}`);
      return res.data;
    },
    enabled: !!tenancyId,
  });

  // 5. Fetch settings for owner UPI VPA
  const { data: settings = {} } = useQuery<any>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings');
      return res.data;
    },
  });

  const onRefresh = async () => {
    if (activeTab === 'invoices') await refetchInvoices();
    else if (activeTab === 'payments') await refetchPayments();
    else if (activeTab === 'ledger') await refetchLedger();
  };

  // Monitor AppState to trigger UTR manual entry form upon return
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (isWaitingForUtr && selectedInvoice) {
          // Launch the UTR numeric entry sheet
          setUpiModalVisible(false);
          setUtrModalVisible(true);
          setIsWaitingForUtr(false);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isWaitingForUtr, selectedInvoice]);

  const handlePayNow = (invoice: any) => {
    setSelectedInvoice(invoice);
    setUpiModalVisible(true);
  };

  const handleLaunchUpi = async (app: 'gpay' | 'phonepe' | 'paytm' | 'generic') => {
    if (!selectedInvoice) return;

    const pa = settings.owner_upi_vpa || 'karamstay@okhdfcbank';
    const pn = settings.payee_name || 'Karam Singh';
    const am = selectedInvoice.amount;
    const tn = encodeURIComponent(`Rent payment Inv #${selectedInvoice.id}`);

    let url = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    if (app === 'gpay') {
      url = `tez://upi/pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    } else if (app === 'phonepe') {
      url = `phonepe://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    } else if (app === 'paytm') {
      url = `paytmmp://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
    }

    try {
      setIsWaitingForUtr(true);
      await Linking.openURL(url);
    } catch (err) {
      // Fallback to generic chooser
      try {
        await Linking.openURL(`upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`);
      } catch (genErr) {
        // Device lacks UPI apps
        Alert.alert('UPI Apps Missing', 'No compatible UPI apps were found. Opening verification entry form directly.');
        setUpiModalVisible(false);
        setUtrModalVisible(true);
        setIsWaitingForUtr(false);
      }
    }
  };

  const handleUtrSubmit = async () => {
    // Exact 12 numeric digits validation
    if (!/^\d{12}$/.test(utrCode)) {
      setUtrError('UTR must be exactly 12 numeric digits');
      return;
    }

    setUtrError('');
    setIsProcessingPayment(true);
    setPaymentStep('Registering payment...');

    try {
      await apiClient.post('/payments/upi/submit', {
        invoice_id: selectedInvoice.id,
        utr_number: utrCode,
        amount: selectedInvoice.amount,
      });

      setUtrModalVisible(false);
      setUtrCode('');
      Alert.alert(
        'Transaction Logged',
        'Your payment is now pending verification. Staff will audit the transaction ledger shortly.'
      );
      onRefresh();
    } catch (err: any) {
      Alert.alert('Verification Submission Failed', parseApiError(err).message || 'Unable to submit payment details.');
    } finally {
      setIsProcessingPayment(false);
      setPaymentStep('');
    }
  };
  // Re-sort ledger and calculate running balance
  const sortedLedger = [...ledger].sort((a, b) => {
    const dateCompare = a.occurred_on.localeCompare(b.occurred_on);
    return dateCompare !== 0 ? dateCompare : a.id - b.id;
  });

  let balance = 0;
  const ledgerWithBalance = sortedLedger.map((entry) => {
    const amt = Number(entry.amount);
    if (entry.direction === 'debit') {
      balance += amt;
    } else {
      balance -= amt;
    }
    return { ...entry, runningBalance: balance };
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderInvoiceItem = ({ item }: { item: any }) => {
    const isUnpaid = item.status === 'pending' || item.status === 'overdue' || item.status === 'partial';
    return (
      <Card style={[styles.card, { borderColor: colors.border, marginBottom: space.sm }]}>
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
        {isUnpaid ? (
          <Button
            label="Pay Invoice"
            onPress={() => handlePayNow(item)}
            loading={isProcessingPayment}
            size="compact"
            style={{ marginTop: space.sm }}
          />
        ) : null}
      </Card>
    );
  };

  const renderPaymentItem = ({ item }: { item: any }) => (
    <Card style={[styles.card, { borderColor: colors.border, marginBottom: space.sm }]}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
            Receipt #{item.id}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
            Mode: {item.mode.toUpperCase()} · Paid on: {item.paid_at ? new Date(item.paid_at).toLocaleDateString() : 'N/A'}
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

  const renderLedgerItem = ({ item }: { item: any }) => {
    const isDebit = item.direction === 'debit';
    return (
      <Card style={[styles.ledgerCard, { borderColor: colors.border, borderLeftColor: isDebit ? '#EF4444' : '#10B981' }]}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1, marginRight: space.sm }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              {item.description}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              {item.occurred_on} · {item.entry_type.toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: isDebit ? '#EF4444' : '#10B981', fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: 4 }}>
              {isDebit ? '+' : '-'} {formatCurrency(item.amount)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              Bal: {formatCurrency(item.runningBalance)}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          STATEMENT LOGS
        </Text>
        <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
          Payments
        </Text>
      </View>

      {/* Processing indicator */}
      {isProcessingPayment ? (
        <Card style={[styles.processingCard, { borderColor: colors.primary }]}>
          <ActivityIndicator color={colors.primary} style={{ marginRight: space.sm }} />
          <Text style={{ color: colors.text, fontWeight: 'bold' }}>{paymentStep}</Text>
        </Card>
      ) : null}

      {/* Tabs */}
      <View style={[styles.segmentedContainer, { borderColor: colors.border }]}>
        {(['invoices', 'payments', 'ledger'] as FinanceTab[]).map((tab) => (
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

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'invoices' ? (
          <FlatList
            data={invoices}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderInvoiceItem}
            contentContainerStyle={{ padding: space.lg }}
            ListEmptyComponent={<EmptyState title="No Invoices Sighted" body="Rent invoices generated will list here." />}
            refreshing={isInvoicesLoading}
            onRefresh={onRefresh}
          />
        ) : null}

        {activeTab === 'payments' ? (
          <FlatList
            data={payments}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderPaymentItem}
            contentContainerStyle={{ padding: space.lg }}
            ListEmptyComponent={<EmptyState title="No Payments Recorded" body="Your processed transaction receipts will list here." />}
            refreshing={isPaymentsLoading}
            onRefresh={onRefresh}
          />
        ) : null}

        {activeTab === 'ledger' ? (
          <FlatList
            data={ledgerWithBalance}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderLedgerItem}
            contentContainerStyle={{ padding: space.lg }}
            ListEmptyComponent={<EmptyState title="Ledger Log Empty" body="Chronological statements ledger will list here." />}
            refreshing={isLedgerLoading}
            onRefresh={onRefresh}
          />
        ) : null}
      </View>

      {/* UPI App Selection Modal */}
      <Modal
        visible={upiModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUpiModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
                Pay with UPI
              </Text>
              <TouchableOpacity onPress={() => setUpiModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.md }}>
              Payee: {settings.payee_name || 'Karam Singh'} ({settings.owner_upi_vpa || 'karamstay@okhdfcbank'}){"\n"}
              Amount: {selectedInvoice ? formatCurrency(selectedInvoice.amount) : ''}
            </Text>

            <TouchableOpacity
              style={[styles.upiButton, { borderColor: colors.border }]}
              onPress={() => handleLaunchUpi('gpay')}
            >
              <Ionicons name="logo-google" size={20} color="#EA4335" style={{ marginRight: space.sm }} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>Google Pay</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.upiButton, { borderColor: colors.border }]}
              onPress={() => handleLaunchUpi('phonepe')}
            >
              <Ionicons name="phone-portrait-outline" size={20} color="#5F259F" style={{ marginRight: space.sm }} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>PhonePe</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.upiButton, { borderColor: colors.border }]}
              onPress={() => handleLaunchUpi('paytm')}
            >
              <Ionicons name="wallet-outline" size={20} color="#00B9F5" style={{ marginRight: space.sm }} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>Paytm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.upiButton, { borderColor: colors.border }]}
              onPress={() => handleLaunchUpi('generic')}
            >
              <Ionicons name="apps-outline" size={20} color={colors.primary} style={{ marginRight: space.sm }} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>Other UPI App</Text>
            </TouchableOpacity>

            <Button
              label="Enter UTR Manually"
              onPress={() => {
                setUpiModalVisible(false);
                setUtrModalVisible(true);
              }}
              variant="secondary"
              style={{ marginTop: space.sm }}
            />
          </Card>
        </View>
      </Modal>

      {/* UTR Verification Input Modal */}
      <Modal
        visible={utrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUtrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: space.xs }}>
              Submit UTR Reference
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.md }}>
              Please copy the 12-digit UTR/Ref number from your payment app receipt and paste it below.
            </Text>

            <TextInput
              style={[
                styles.utrInput,
                { color: colors.text, borderColor: utrError ? semanticColor.error.solid : colors.border },
              ]}
              placeholder="12-digit UTR code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={12}
              value={utrCode}
              onChangeText={(text) => {
                setUtrCode(text.replace(/\D/g, ''));
                setUtrError('');
              }}
            />

            {utrError ? (
              <Text style={{ color: semanticColor.error.solid, fontSize: 12, marginBottom: space.md, fontWeight: 'bold' }}>
                {utrError}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row' }}>
              <Button
                label="Cancel"
                onPress={() => setUtrModalVisible(false)}
                variant="secondary"
                style={{ flex: 1, marginRight: space.sm }}
              />
              <Button
                label="Verify Payment"
                onPress={handleUtrSubmit}
                loading={isProcessingPayment}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
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
  processingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    marginHorizontal: 20,
    padding: 12,
    marginBottom: 12,
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
  card: {
    borderWidth: 1,
    padding: 12,
  },
  ledgerCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  upiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
  },
  utrInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 2,
  },
});
