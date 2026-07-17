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
import * as Location from 'expo-location';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface UnitFormProps {
  route: any;
  navigation: any;
}

export const UnitForm: React.FC<UnitFormProps> = ({ route, navigation }) => {
  const { propertyId, id } = route.params || {};
  const isEdit = !!id;

  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Form states
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('vacant');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Fetch unit details if editing
  const { data: unit, isLoading: isFetching } = useQuery({
    queryKey: ['unit', id],
    queryFn: async () => {
      const res = await apiClient.get(`/units/${id}`);
      return res.data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (unit) {
      setUnitNo(unit.unit_no);
      setUnitType(unit.unit_type);
      setBuilding(unit.building || '');
      setFloor(unit.floor || '');
      setRent(String(unit.rent));
      setDeposit(String(unit.deposit));
      setCapacity(String(unit.capacity));
      setNotes(unit.notes || '');
      setStatus(unit.status);
      setLatitude(unit.latitude || null);
      setLongitude(unit.longitude || null);
    }
  }, [unit]);

  const handleDropPin = async () => {
    setIsLocating(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        showToast('Location permission denied.', 'error');
        setIsLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      showToast('Coordinates captured successfully!', 'success');
    } catch (err: any) {
      showToast('Error getting current location: ' + err.message, 'error');
    } finally {
      setIsLocating(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (isEdit) {
        return (await apiClient.patch(`/units/${id}`, payload)).data;
      } else {
        return (await apiClient.post(`/properties/${propertyId}/units`, payload)).data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-units', propertyId] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ['unit', id] });
      }
      showToast(isEdit ? 'Unit updated successfully' : 'Unit created successfully', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, 1000);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Submission failed', 'error');
    },
  });

  const handleSubmit = () => {
    const newErrors: { [key: string]: string } = {};
    if (!unitNo || unitNo.length < 1 || unitNo.length > 40) {
      newErrors.unitNo = 'Unit number is required (max 40 chars)';
    }
    if (!unitType || unitType.length < 2 || unitType.length > 20) {
      newErrors.unitType = 'Unit type is required (2-20 chars)';
    }
    
    const rentNum = parseFloat(rent);
    if (isNaN(rentNum) || rentNum < 0) {
      newErrors.rent = 'Rent must be a valid positive number';
    }

    const depositNum = parseFloat(deposit);
    if (isNaN(depositNum) || depositNum < 0) {
      newErrors.deposit = 'Deposit must be a valid positive number';
    }

    const capacityNum = parseInt(capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      newErrors.capacity = 'Capacity must be at least 1';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload: any = {
      unit_no: unitNo.trim(),
      unit_type: unitType.trim(),
      building: building.trim() || null,
      floor: floor.trim() || null,
      rent: rentNum,
      deposit: depositNum,
      capacity: capacityNum,
      notes: notes.trim() || null,
      latitude,
      longitude,
    };

    if (isEdit) {
      payload.status = status;
    }

    submitMutation.mutate(payload);
  };

  const unitTypeOptions = [
    { label: 'Room', value: 'room' },
    { label: '1BHK', value: '1bhk' },
    { label: '2BHK', value: '2bhk' },
    { label: '3BHK', value: '3bhk' },
    { label: 'Studio', value: 'studio' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />
      
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          {isEdit ? 'Edit Unit' : 'Add Unit'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Input
            label="Unit Number"
            value={unitNo}
            onChangeText={setUnitNo}
            placeholder="e.g. 302"
            style={{ width: '48%' }}
            error={errors.unitNo}
          />
          <Input
            label="Unit Type"
            value={unitType}
            onChangeText={setUnitType}
            type="select"
            options={unitTypeOptions}
            placeholder="Select type"
            style={{ width: '48%' }}
            error={errors.unitType}
          />
        </View>

        <View style={styles.row}>
          <Input
            label="Building/Block"
            value={building}
            onChangeText={setBuilding}
            placeholder="e.g. Block A"
            style={{ width: '48%' }}
          />
          <Input
            label="Floor"
            value={floor}
            onChangeText={setFloor}
            placeholder="e.g. 3rd Floor"
            style={{ width: '48%' }}
          />
        </View>

        <View style={styles.row}>
          <Input
            label="Monthly Rent"
            value={rent}
            onChangeText={setRent}
            placeholder="INR"
            keyboardType="decimal-pad"
            style={{ width: '48%' }}
            error={errors.rent}
          />
          <Input
            label="Security Deposit"
            value={deposit}
            onChangeText={setDeposit}
            placeholder="INR"
            keyboardType="decimal-pad"
            style={{ width: '48%' }}
            error={errors.deposit}
          />
        </View>

        <Input
          label="Max Capacity"
          value={capacity}
          onChangeText={setCapacity}
          placeholder="e.g. 2"
          keyboardType="numeric"
          error={errors.capacity}
        />

        <TouchableOpacity
          onPress={handleDropPin}
          disabled={isLocating}
          style={[
            styles.dropPinBtn,
            {
              borderColor: colors.primary,
              backgroundColor: isLocating ? colors.border : 'transparent',
              marginBottom: space.md,
            },
          ]}
        >
          <Ionicons
            name={isLocating ? 'refresh-outline' : 'pin-outline'}
            size={18}
            color={colors.primary}
            style={{ marginRight: 6 }}
          />
          <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.caption.fontSize }}>
            {isLocating ? 'Acquiring GPS Pin...' : 'Drop Pin (Auto-fill Coordinates)'}
          </Text>
        </TouchableOpacity>

        {latitude && longitude ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -space.xs, marginBottom: space.md }}>
            Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Text>
        ) : null}

        {isEdit ? (
          <Input
            label="Status"
            value={status}
            onChangeText={setStatus}
            type="select"
            options={[
              { label: 'Vacant', value: 'vacant' },
              { label: 'Occupied', value: 'occupied' },
            ]}
          />
        ) : null}

        <Input
          label="Unit Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes or details"
        />

        <Button
          label={isEdit ? 'Save Changes' : 'Create Unit'}
          onPress={handleSubmit}
          loading={submitMutation.isPending || isFetching}
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
  dropPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
