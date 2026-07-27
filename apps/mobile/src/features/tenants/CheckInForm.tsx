import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface Property {
  id: number;
  name: string;
}

interface Unit {
  id: number;
  unit_no: string;
  unit_type: string;
  rent: number;
  deposit: number;
  status: string;
  capacity?: number;
}

export const CheckInForm: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const {
    tenantId,
    propertyId: passedPropId,
    unitId: passedUnitId,
    bedIds: passedBedIds,
    rent: passedRent,
    deposit: passedDeposit,
  } = route.params || {};
  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  const [selectedTenantId, setSelectedTenantId] = useState(tenantId ? String(tenantId) : '');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [billingDay, setBillingDay] = useState('1');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [bedIds, setBedIds] = useState<number[]>(passedBedIds || []);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // --- Queries ---

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

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['property-units', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return [];
      const res = await apiClient.get(`/properties/${selectedPropertyId}/units`);
      return res.data;
    },
    enabled: !!selectedPropertyId,
  });

  // Derive selected unit metadata
  const selectedUnitData = units.find((u) => String(u.id) === selectedUnitId);
  const isMultiBedUnit = (selectedUnitData?.capacity ?? 1) > 1;

  // Fetch beds for the chosen unit only when it is multi-bed
  const { data: unitBeds = [] } = useQuery<any[]>({
    queryKey: ['unit-beds-checkin', selectedUnitId],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${selectedUnitId}/beds`);
      return res.data;
    },
    enabled: !!selectedUnitId && isMultiBedUnit,
  });

  const vacantUnitBeds = unitBeds.filter((b) => b.status === 'vacant');
  const allBedsOccupied = isMultiBedUnit && unitBeds.length > 0 && vacantUnitBeds.length === 0;

  // For single-bed units show only vacant ones; for multi-bed, always include
  // (bed-picker will block selection of occupied beds)
  const availableUnits = units.filter(
    (u) =>
      u.status === 'vacant' ||
      (u.capacity != null && u.capacity > 1) ||
      String(u.id) === selectedUnitId
  );

  // --- Sync params on mount ---
  useEffect(() => {
    if (passedPropId) setSelectedPropertyId(String(passedPropId));
    if (passedUnitId) setSelectedUnitId(String(passedUnitId));
    if (passedRent !== undefined) setRent(String(passedRent));
    if (passedDeposit !== undefined) setDeposit(String(passedDeposit));
  }, [passedPropId, passedUnitId, passedRent, passedDeposit]);

  // Auto-fill rent & deposit when unit changes
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

  // Reset bed selection when the unit picker changes (unless coming from pre-selected params)
  const handleUnitChange = (val: string) => {
    setSelectedUnitId(val);
    if (val !== String(passedUnitId)) {
      setBedIds([]);
    }
  };

  // --- Mutation ---

  const checkinMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/tenancies', payload);
      return res.data;
    },
    onSuccess: (data) => {
      // Broad-invalidate all affected cache keys for zero stale-data
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenancy-by-tenant', parseInt(selectedTenantId)] });
      if (selectedTenantId) {
        queryClient.invalidateQueries({ queryKey: ['tenant', parseInt(selectedTenantId)] });
      }
      queryClient.invalidateQueries({ queryKey: ['property-units'] });
      queryClient.invalidateQueries({ queryKey: ['unit-beds-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['unit-beds', parseInt(selectedUnitId)] });
      queryClient.invalidateQueries({ queryKey: ['unit-tenancies', parseInt(selectedUnitId)] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['owner-inventory-units'] });
      queryClient.invalidateQueries({ queryKey: ['owner-inventory-beds'] });
      queryClient.invalidateQueries({ queryKey: ['manager-units-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['manager-beds-dashboard'] });

      showToast('Checked in successfully! Tenancy initialized.', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, 1200);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Check-in failed', 'error');
    },
  });

  // --- Validation & Submit ---

  const handleCheckIn = () => {
    const newErrors: { [key: string]: string } = {};
    if (!selectedTenantId) newErrors.tenant = 'Tenant is required';
    if (!selectedPropertyId) newErrors.property = 'Property is required';
    if (!selectedUnitId) newErrors.unit = 'Unit is required';
    if (!startDate) newErrors.startDate = 'Start date is required';

    const rentNum = parseFloat(rent);
    if (isNaN(rentNum) || rentNum < 0) newErrors.rent = 'Monthly rent must be a positive number';

    const depositNum = parseFloat(deposit);
    if (isNaN(depositNum) || depositNum < 0) newErrors.deposit = 'Deposit must be a positive number';

    const billDayNum = parseInt(billingDay);
    if (isNaN(billDayNum) || billDayNum < 1 || billDayNum > 28)
      newErrors.billingDay = 'Billing day must be between 1 and 28';

    // Bed validation for multi-bed units
    if (isMultiBedUnit && bedIds.length === 0)
      newErrors.beds = 'Please select at least one bed for this shared unit';
    if (allBedsOccupied)
      newErrors.unit = 'All beds in this unit are occupied. Select a different unit.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    checkinMutation.mutate({
      tenant_id: parseInt(selectedTenantId),
      unit_id: parseInt(selectedUnitId),
      bed_ids: bedIds,
      start_date: startDate,
      monthly_rent: rentNum,
      security_deposit: depositNum,
      billing_day: billDayNum,
      installment_count: parseInt(installmentCount),
    });
  };

  // --- Derived options ---

  const propertyOptions = properties.map((p) => ({ label: p.name, value: String(p.id) }));

  const unitOptions = availableUnits.map((u) => ({
    label: `Unit ${u.unit_no}${u.capacity && u.capacity > 1 ? ` (${u.capacity}-bed shared)` : ' (private)'} · ₹${u.rent}`,
    value: String(u.id),
  }));

  const billingDayOptions = Array.from({ length: 28 }, (_, i) => ({
    label: `Day ${i + 1}`,
    value: String(i + 1),
  }));

  // --- Render ---

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
          Check-in Tenant
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">

        {/* Tenant selector — hidden when tenantId is pre-supplied */}
        {!tenantId && (
          <Input
            label="Select Tenant"
            value={selectedTenantId}
            onChangeText={setSelectedTenantId}
            type="select"
            options={tenants.map((t) => ({ label: `${t.name} (${t.phone})`, value: String(t.id) }))}
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
            setBedIds([]);
          }}
          type="select"
          options={propertyOptions}
          placeholder="Choose property..."
          error={errors.property}
        />

        <Input
          label="Select Unit"
          value={selectedUnitId}
          onChangeText={handleUnitChange}
          type="select"
          options={unitOptions}
          placeholder={selectedPropertyId ? 'Choose unit...' : 'Choose property first'}
          disabled={!selectedPropertyId}
          error={errors.unit}
        />

        {/* ── BED PICKER ── visible only for multi-bed units */}
        {isMultiBedUnit && !!selectedUnitId && (
          <View style={{ marginBottom: space.md }}>
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 }}>
              SELECT BED(S) FOR THIS UNIT
            </Text>

            {unitBeds.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                Loading beds…
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {unitBeds.map((bed: any) => {
                  const isOccupied = bed.status === 'occupied';
                  const isSelected = bedIds.includes(bed.id);
                  return (
                    <TouchableOpacity
                      key={bed.id}
                      disabled={isOccupied}
                      activeOpacity={0.75}
                      onPress={() => {
                        setBedIds((prev) =>
                          prev.includes(bed.id)
                            ? prev.filter((id) => id !== bed.id)
                            : [...prev, bed.id]
                        );
                        // Clear bed error on selection
                        if (errors.beds) setErrors((e) => ({ ...e, beds: '' }));
                      }}
                      style={[
                        styles.bedChip,
                        {
                          borderColor: isOccupied
                            ? colors.border
                            : isSelected
                            ? colors.primary
                            : colors.border,
                          backgroundColor: isOccupied
                            ? colors.border + '30'
                            : isSelected
                            ? colors.primary + '18'
                            : 'transparent',
                          opacity: isOccupied ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isOccupied ? 'lock-closed' : isSelected ? 'checkmark-circle' : 'bed-outline'}
                        size={14}
                        color={isOccupied ? colors.textMuted : isSelected ? colors.primary : colors.text}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={{
                          fontWeight: '600',
                          fontSize: font.caption.fontSize,
                          color: isOccupied ? colors.textMuted : isSelected ? colors.primary : colors.text,
                        }}
                      >
                        {bed.bed_no}
                        {isOccupied ? ' · Occupied' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {allBedsOccupied ? (
              <Text style={{ color: semanticColor.error.solid, fontSize: font.caption.fontSize, marginTop: 6 }}>
                All beds in this unit are currently occupied. Please select a different unit.
              </Text>
            ) : null}

            {errors.beds ? (
              <Text style={{ color: semanticColor.error.solid, fontSize: font.caption.fontSize, marginTop: 4 }}>
                {errors.beds}
              </Text>
            ) : null}
          </View>
        )}

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
          disabled={allBedsOccupied}
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
});
