import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface Property {
  id: number;
  name: string;
}

interface Unit {
  id: number;
  unit_no: string;
  rent: number;
  deposit: number;
  status: string;
}

export const CheckInForm: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { tenantId, propertyId: passedPropId, unitId: passedUnitId, bedIds: passedBedIds, rent: passedRent, deposit: passedDeposit } = route.params || {};
  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Selected values
  const [selectedTenantId, setSelectedTenantId] = useState(tenantId ? String(tenantId) : '');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [billingDay, setBillingDay] = useState('1');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [bedIds, setBedIds] = useState<number[]>(passedBedIds || []);

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

  // Queries
  const { data: tenants = [] } = useQuery<any[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const res = await apiClient.get('/tenants');
      return res.data;
    },
    enabled: !tenantId,
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await apiClient.get('/properties');
      return res.data;
    },
  });

  const { data: units = [], refetch: refetchUnits } = useQuery<Unit[]>({
    queryKey: ['property-units', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return [];
      const res = await apiClient.get(`/properties/${selectedPropertyId}/units`);
      return res.data;
    },
    enabled: !!selectedPropertyId,
  });

  // Filter vacant units (or if unit was preselected, include it)
  const vacantUnits = units.filter((u) => u.status === 'vacant' || String(u.id) === selectedUnitId);

  // Sync passed properties and units
  useEffect(() => {
    if (passedPropId) {
      setSelectedPropertyId(String(passedPropId));
    }
    if (passedUnitId) {
      setSelectedUnitId(String(passedUnitId));
    }
    if (passedRent !== undefined) {
      setRent(String(passedRent));
    }
    if (passedDeposit !== undefined) {
      setDeposit(String(passedDeposit));
    }
  }, [passedPropId, passedUnitId, passedRent, passedDeposit]);

  // Sync rent/deposit when unit changes
  useEffect(() => {
    if (selectedUnitId) {
      if (selectedUnitId === String(passedUnitId)) {
        if (passedRent !== undefined) setRent(String(passedRent));
        if (passedDeposit !== undefined) setDeposit(String(passedDeposit));
      } else {
        const unit = units.find((u) => String(u.id) === selectedUnitId);
        if (unit) {
          setRent(String(unit.rent));
          setDeposit(String(unit.deposit));
        }
      }
    }
  }, [selectedUnitId, units, passedUnitId, passedRent, passedDeposit]);

  const checkinMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/tenancies', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      if (selectedTenantId) {
        queryClient.invalidateQueries({ queryKey: ['tenant', selectedTenantId] });
      }
      queryClient.invalidateQueries({ queryKey: ['property-units'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      
      // Force invalidate specific tenancy check query
      queryClient.invalidateQueries({ queryKey: ['tenancy', data.id] });
      queryClient.invalidateQueries({ queryKey: ['tenancy', selectedTenantId] });

      showToast('Checked in successfully! Tenancy initialized.', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, 1200);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Check-in failed', 'error');
    },
  });

  const handleCheckIn = () => {
    const newErrors: { [key: string]: string } = {};
    if (!selectedTenantId) newErrors.tenant = 'Tenant is required';
    if (!selectedPropertyId) newErrors.property = 'Property is required';
    if (!selectedUnitId) newErrors.unit = 'Unit is required';
    if (!startDate) newErrors.startDate = 'Start date is required';
    
    const rentNum = parseFloat(rent);
    if (isNaN(rentNum) || rentNum < 0) {
      newErrors.rent = 'Monthly rent must be a positive number';
    }

    const depositNum = parseFloat(deposit);
    if (isNaN(depositNum) || depositNum < 0) {
      newErrors.deposit = 'Deposit must be a positive number';
    }

    const billDayNum = parseInt(billingDay);
    if (isNaN(billDayNum) || billDayNum < 1 || billDayNum > 28) {
      newErrors.billingDay = 'Billing day must be between 1 and 28';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload = {
      tenant_id: parseInt(selectedTenantId),
      unit_id: parseInt(selectedUnitId),
      bed_ids: bedIds,
      start_date: startDate,
      monthly_rent: rentNum,
      security_deposit: depositNum,
      billing_day: billDayNum,
      installment_count: parseInt(installmentCount),
    };

    checkinMutation.mutate(payload);
  };

  const propertyOptions = properties.map((p) => ({
    label: p.name,
    value: String(p.id),
  }));

  const unitOptions = vacantUnits.map((u) => ({
    label: `Unit ${u.unit_no} (Rent: ${u.rent})`,
    value: String(u.id),
  }));

  const billingDayOptions = Array.from({ length: 28 }, (_, i) => ({
    label: `Day ${i + 1}`,
    value: String(i + 1),
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />
      
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Check-in Tenant
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        {!tenantId && (
          <Input
            label="Select Tenant"
            value={selectedTenantId}
            onChangeText={setSelectedTenantId}
            type="select"
            options={tenants.map(t => ({ label: `${t.name} (${t.phone})`, value: String(t.id) }))}
            placeholder="Choose tenant..."
            error={errors.tenant}
          />
        )}

        <Input
          label="Select Property"
          value={selectedPropertyId}
          onChangeText={(val) => {
            setSelectedPropertyId(val);
            setSelectedUnitId('');
          }}
          type="select"
          options={propertyOptions}
          placeholder="Choose property..."
          error={errors.property}
        />

        <Input
          label="Select Unit"
          value={selectedUnitId}
          onChangeText={setSelectedUnitId}
          type="select"
          options={unitOptions}
          placeholder={selectedPropertyId ? 'Choose unit...' : 'Choose property first'}
          disabled={!selectedPropertyId}
          error={errors.unit}
        />

        {bedIds.length > 0 ? (
          <View style={{ marginBottom: space.md }}>
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize, fontWeight: 'bold', marginBottom: space.xs }}>
              Selected Bed Slots
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {bedIds.map((bid) => (
                <View key={bid} style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 8, marginBottom: 8 }}>
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>
                    Bed ID: #{bid}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Input
          label="Start Date"
          value={startDate}
          onChangeText={setStartDate}
          type="date"
          placeholder="YYYY-MM-DD"
          error={errors.startDate}
        />

        <View style={styles.row}>
          <Input
            label="Contract Monthly Rent"
            value={rent}
            onChangeText={setRent}
            placeholder="INR"
            keyboardType="decimal-pad"
            style={{ width: '48%' }}
            error={errors.rent}
          />
          <Input
            label="Contract Security Deposit"
            value={deposit}
            onChangeText={setDeposit}
            placeholder="INR"
            keyboardType="decimal-pad"
            style={{ width: '48%' }}
            error={errors.deposit}
          />
        </View>

        <Input
          label="Monthly Billing Day"
          value={billingDay}
          onChangeText={setBillingDay}
          type="select"
          options={billingDayOptions}
          placeholder="Select billing day"
          error={errors.billingDay}
        />

        <Input
          label="Installment Count (Payment Split)"
          value={installmentCount}
          onChangeText={setInstallmentCount}
          type="select"
          options={[
            { label: 'Single Payment (No Split)', value: '1' },
            { label: '2 Monthly Installments', value: '2' },
            { label: '3 Monthly Installments', value: '3' },
            { label: '4 Monthly Installments', value: '4' },
            { label: '6 Monthly Installments', value: '6' },
          ]}
          placeholder="Select installment count"
        />

        <Button
          label="Execute Check-in"
          onPress={handleCheckIn}
          loading={checkinMutation.isPending}
          style={{ marginTop: space.md }}
        />
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
