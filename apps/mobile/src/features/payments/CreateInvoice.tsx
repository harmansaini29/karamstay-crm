import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface Tenant {
  id: number;
  name: string;
  phone: string;
}

interface Tenancy {
  id: number;
  tenant_id: number;
  unit_id: number;
  status: string;
}

export const CreateInvoice: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Form fields — an invoice belongs to a TENANCY, so we select a real tenancy id
  // (not a tenant id, which the old code incorrectly submitted as tenancy_id).
  const [selectedTenancyId, setSelectedTenancyId] = useState('');
  const [billingPeriod, setBillingPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 7 days from now
  const [amount, setAmount] = useState('');

  // UI States
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Query tenants (for display names) and tenancies (the real invoice target).
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const res = await apiClient.get('/tenants');
      return res.data;
    },
  });

  const { data: tenancies = [], isLoading: isTenanciesLoading } = useQuery<Tenancy[]>({
    queryKey: ['tenancies'],
    queryFn: async () => {
      const res = await apiClient.get('/tenancies');
      return res.data;
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/invoices', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      
      showToast('Invoice generated successfully!', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, 1200);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Generation failed', 'error');
    },
  });

  const handleSubmit = () => {
    const newErrors: { [key: string]: string } = {};
    if (!selectedTenancyId) newErrors.tenant = 'Please select a tenancy';
    if (!billingPeriod || !/^\d{4}-\d{2}$/.test(billingPeriod)) {
      newErrors.billingPeriod = 'Billing period must be in YYYY-MM format';
    }
    if (!dueDate) newErrors.dueDate = 'Due date is required';

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal < 0) {
      newErrors.amount = 'Amount must be a valid positive number';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload = {
      tenancy_id: parseInt(selectedTenancyId), // a real tenancy id from GET /tenancies
      billing_period: billingPeriod,
      due_date: dueDate,
      amount: amountVal,
    };

    createInvoiceMutation.mutate(payload);
  };

  const tenantName = (tenantId: number) => tenants.find((t) => t.id === tenantId)?.name ?? `Tenant #${tenantId}`;
  const tenancyOptions = tenancies.map((tc) => ({
    label: `${tenantName(tc.tenant_id)} · Unit ${tc.unit_id} · #${tc.id}${tc.status !== 'active' ? ` (${tc.status})` : ''}`,
    value: String(tc.id),
  }));

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
          Generate Invoice
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Input
          label="Select Tenancy"
          value={selectedTenancyId}
          onChangeText={setSelectedTenancyId}
          type="select"
          options={tenancyOptions}
          placeholder={isTenanciesLoading ? 'Loading tenancies...' : 'Choose tenancy...'}
          error={errors.tenant}
        />

        <Input
          label="Billing Period"
          value={billingPeriod}
          onChangeText={setBillingPeriod}
          placeholder="YYYY-MM (e.g. 2026-07)"
          error={errors.billingPeriod}
        />

        <Input
          label="Due Date"
          value={dueDate}
          onChangeText={setDueDate}
          type="date"
          placeholder="YYYY-MM-DD"
          error={errors.dueDate}
        />

        <Input
          label="Invoice Amount (INR)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors.amount}
        />

        <Button
          label="Issue Invoice"
          onPress={handleSubmit}
          loading={createInvoiceMutation.isPending}
          style={{ marginTop: space.md }}
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
});
