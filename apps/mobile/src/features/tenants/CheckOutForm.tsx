import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast, LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { useFinancialMask } from '../../hooks/useFinancialMask';

interface LedgerEntry {
  id: number;
  entry_type: string;
  direction: 'debit' | 'credit';
  amount: number;
}

interface Tenancy {
  id: number;
  tenant_id: number;
  unit_id: number;
  security_deposit: number;
  monthly_rent: number;
  status: string;
}

export const CheckOutForm: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { tenancyId } = route.params;
  const { colors, font, space, radius } = useTheme();
  const queryClient = useQueryClient();

  // Inputs
  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [damageAmount, setDamageAmount] = useState('0');
  const [damageNote, setDamageNote] = useState('');

  // Previews
  const [outstandingDues, setOutstandingDues] = useState(0);
  const [depositRefund, setDepositRefund] = useState(0);

  // UI States
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errorMsg, setErrorMsg] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Queries
  const { data: tenancy, isLoading: isTenancyLoading } = useQuery<Tenancy>({
    queryKey: ['tenancy', tenancyId],
    queryFn: async () => {
      const res = await apiClient.get(`/tenancies/${tenancyId}`);
      return res.data;
    },
  });

  const { data: ledger = [], isLoading: isLedgerLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', tenancyId],
    queryFn: async () => {
      const res = await apiClient.get(`/ledger?tenancy_id=${tenancyId}`);
      return res.data;
    },
  });

  // Calculate previews whenever inputs or ledger change
  useEffect(() => {
    if (!tenancy) return;

    let totalDebits = 0;
    let totalCredits = 0;

    ledger.forEach((entry) => {
      if (entry.direction === 'debit') {
        totalDebits += Number(entry.amount);
      } else {
        totalCredits += Number(entry.amount);
      }
    });

    const damageVal = parseFloat(damageAmount) || 0;
    const secDep = Number(tenancy.security_deposit);

    // Dues calculation excluding security deposit debit
    let dues = totalDebits - totalCredits - secDep;
    if (dues < 0) dues = 0;

    // Refund calculation
    let refund = secDep - damageVal - dues;
    if (refund < 0) refund = 0;

    setOutstandingDues(dues);
    setDepositRefund(refund);
  }, [ledger, tenancy, damageAmount]);

  const checkoutMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post(`/tenancies/${tenancyId}/checkout`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      if (tenancy) {
        queryClient.invalidateQueries({ queryKey: ['tenant', tenancy.tenant_id] });
      }
      queryClient.invalidateQueries({ queryKey: ['tenancy', tenancyId] });
      queryClient.invalidateQueries({ queryKey: ['property-units'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });

      showToast('Checkout executed successfully!', 'success');
      setTimeout(() => {
        navigation.navigate('TenantsList');
      }, 1500);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Checkout failed', 'error');
    },
  });

  const handleConfirmCheckout = () => {
    const damageVal = parseFloat(damageAmount) || 0;
    if (isNaN(damageVal) || damageVal < 0) {
      setErrorMsg('Damage amount must be a positive number');
      return;
    }
    setErrorMsg('');

    Alert.alert(
      'Confirm Check-out',
      'This action is final, irreversible, and will vacate the rental unit. Are you sure you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Check-out',
          style: 'destructive',
          onPress: () => {
            const payload = {
              move_out_date: moveOutDate,
              damage_charges: [],
            };
            checkoutMutation.mutate(payload);
          },
        },
      ]
    );
  };

  // ⚠️ All hooks and hook-like formatters must precede conditional returns (Rules of Hooks)
  const { maskAmount } = useFinancialMask();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  if (isTenancyLoading || isLedgerLoading) return <LoadingSkeleton variant="detail" />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />

        <View style={styles.header}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
            Tenancy Checkout
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
          <Input
            label="Move-out Date"
            value={moveOutDate}
            onChangeText={setMoveOutDate}
            type="date"
            placeholder="YYYY-MM-DD"
          />

          <Input
            label="Flat Damage Deduction (INR)"
            value={damageAmount}
            onChangeText={setDamageAmount}
            placeholder="0"
            keyboardType="decimal-pad"
            error={errorMsg}
          />

          <Input
            label="Damage Notes"
            value={damageNote}
            onChangeText={setDamageNote}
            placeholder="Describe damages if any"
          />

          {/* Settlement breakdown preview */}
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.h3.fontSize, marginTop: space.md, marginBottom: space.sm }]}>
            Settlement Preview
          </Text>

          <Card style={[styles.breakdownCard, { borderColor: colors.border }]}>
            <View style={styles.breakdownRow}>
              <Text style={{ color: colors.text, fontSize: font.body.fontSize }}>Security Deposit Held</Text>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.bodyStrong.fontSize }}>
                {maskAmount(tenancy?.security_deposit || 0)}
              </Text>
            </View>

            <View style={styles.breakdownRow}>
              <Text style={{ color: colors.text, fontSize: font.body.fontSize }}>Outstanding Dues</Text>
              <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: font.bodyStrong.fontSize }}>
                {maskAmount(outstandingDues)}
              </Text>
            </View>

            <View style={styles.breakdownRow}>
              <Text style={{ color: colors.text, fontSize: font.body.fontSize }}>Damage Deduction</Text>
              <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: font.bodyStrong.fontSize }}>
                - {formatCurrency(parseFloat(damageAmount) || 0)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={[styles.breakdownRow, { marginBottom: 0 }]}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>Estimated Refund</Text>
              <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: font.h2.fontSize }}>
                {maskAmount(depositRefund)}
              </Text>
            </View>
          </Card>

          <Button
            label="Confirm & Finalize Checkout"
            onPress={handleConfirmCheckout}
            loading={checkoutMutation.isPending}
            variant="destructive"
            style={{ marginTop: space.lg }}
          />
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
  headerTitle: {
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  breakdownCard: {
    borderWidth: 1,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
});
