import React, { useState } from 'react';
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

export const CreateExpense: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Form fields
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

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

  // Query properties
  const { data: properties = [], isLoading: isPropsLoading } = useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await apiClient.get('/properties');
      return res.data;
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/expenses', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      
      showToast('Expense recorded successfully!', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, 1200);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Recording failed', 'error');
    },
  });

  const handleSubmit = () => {
    const newErrors: { [key: string]: string } = {};
    if (!selectedPropertyId) newErrors.property = 'Property association is required';
    if (!category || category.length < 2 || category.length > 80) {
      newErrors.category = 'Category is required (2-80 characters)';
    }
    if (!expenseDate) newErrors.expenseDate = 'Expense date is required';
    
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
      property_id: parseInt(selectedPropertyId),
      category: category.trim(),
      amount: amountVal,
      expense_date: expenseDate,
      description: description.trim() || null,
    };

    createExpenseMutation.mutate(payload);
  };

  const propertyOptions = properties.map((p) => ({
    label: p.name,
    value: String(p.id),
  }));

  const categoryOptions = [
    { label: 'Electricity Bill', value: 'Electricity Bill' },
    { label: 'Water Bill', value: 'Water Bill' },
    { label: 'Maintenance / Repairs', value: 'Repairs' },
    { label: 'Internet / WiFi', value: 'Internet' },
    { label: 'Salaries / Staff', value: 'Staff Salary' },
    { label: 'Taxes / Insurance', value: 'Taxes' },
    { label: 'Cleaning Services', value: 'Cleaning' },
    { label: 'Other Miscellaneous', value: 'Other' },
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
          Record Expense
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Input
          label="Select Property"
          value={selectedPropertyId}
          onChangeText={setSelectedPropertyId}
          type="select"
          options={propertyOptions}
          placeholder={isPropsLoading ? 'Loading properties...' : 'Choose property...'}
          error={errors.property}
        />

        <Input
          label="Category"
          value={category}
          onChangeText={setCategory}
          type="select"
          options={categoryOptions}
          placeholder="Select category"
          error={errors.category}
        />

        <Input
          label="Expense Date"
          value={expenseDate}
          onChangeText={setExpenseDate}
          type="date"
          placeholder="YYYY-MM-DD"
          error={errors.expenseDate}
        />

        <Input
          label="Expense Amount (INR)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors.amount}
        />

        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Repairs for room 302 bathroom faucet leak"
        />

        <Button
          label="Record Expense"
          onPress={handleSubmit}
          loading={createExpenseMutation.isPending}
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
