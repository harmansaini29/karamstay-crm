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

interface TenantFormProps {
  route: any;
  navigation: any;
}

export const TenantForm: React.FC<TenantFormProps> = ({ route, navigation }) => {
  const { id } = route.params || {};
  const isEdit = !!id;

  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [occupation, setOccupation] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [ownerNotes, setOwnerNotes] = useState('');

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Fetch tenant details if editing
  const { data: tenant, isLoading: isFetching } = useQuery({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const res = await apiClient.get(`/tenants/${id}`);
      return res.data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setPhone(tenant.phone);
      setEmail(tenant.email || '');
      setDateOfBirth(tenant.date_of_birth || '');
      setOccupation(tenant.occupation || '');
      setEmergencyName(tenant.emergency_contact_name || '');
      setEmergencyPhone(tenant.emergency_contact_phone || '');
      setOwnerNotes(tenant.owner_notes || '');
    }
  }, [tenant]);

  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (isEdit) {
        return (await apiClient.patch(`/tenants/${id}`, payload)).data;
      } else {
        return (await apiClient.post('/tenants', payload)).data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      }
      showToast(isEdit ? 'Tenant profile updated' : 'Tenant profile created', 'success');
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
    if (!name || name.length < 2 || name.length > 120) {
      newErrors.name = 'Name must be between 2 and 120 characters';
    }
    if (!phone || phone.length < 8 || phone.length > 32) {
      newErrors.phone = 'Phone number is required (8-32 characters)';
    }
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Invalid email address';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload: any = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      date_of_birth: dateOfBirth.trim() || null,
      occupation: occupation.trim() || null,
      emergency_contact_name: emergencyName.trim() || null,
      emergency_contact_phone: emergencyPhone.trim() || null,
      owner_notes: ownerNotes.trim() || null,
    };

    submitMutation.mutate(payload);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />
      
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          {isEdit ? 'Edit Tenant' : 'Add Tenant'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Input
          label="Full Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. John Doe"
          error={errors.name}
        />

        <Input
          label="Phone Number"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. +91 XXXXX XXXXX"
          keyboardType="phone-pad"
          error={errors.phone}
        />

        <Input
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. john@example.com"
          keyboardType="email-address"
          error={errors.email}
        />

        <Input
          label="Date of Birth"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          type="date"
          placeholder="YYYY-MM-DD"
        />

        <Input
          label="Occupation"
          value={occupation}
          onChangeText={setOccupation}
          placeholder="e.g. Software Engineer"
        />

        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14, marginVertical: space.sm }}>
          Emergency Contact Details
        </Text>

        <Input
          label="Contact Person Name"
          value={emergencyName}
          onChangeText={setEmergencyName}
          placeholder="e.g. Jane Doe"
        />

        <Input
          label="Contact Person Phone"
          value={emergencyPhone}
          onChangeText={setEmergencyPhone}
          placeholder="e.g. +91 XXXXX XXXXX"
          keyboardType="phone-pad"
        />

        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14, marginVertical: space.sm }}>
          Administrative
        </Text>

        <Input
          label="Owner/Staff Notes"
          value={ownerNotes}
          onChangeText={setOwnerNotes}
          placeholder="Add notes visible to staff only"
        />

        <Button
          label={isEdit ? 'Save Changes' : 'Create Profile'}
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
});
