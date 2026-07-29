import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface SettingsData {
  late_fee_grace_days: number;
  late_fee_percent_per_day: number;
  brand_name: string;
  whatsapp_otp_template: string;
  whatsapp_payment_confirmation_template: string;
  whatsapp_generic_notice_template: string;
}

export const SettingsView: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Form fields
  const [graceDays, setGraceDays] = useState('0');
  const [feePercent, setFeePercent] = useState('0');
  const [brandName, setBrandName] = useState('');
  const [otpTemplate, setOtpTemplate] = useState('');
  const [payConfTemplate, setPayConfTemplate] = useState('');
  const [noticeTemplate, setNoticeTemplate] = useState('');

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

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings');
      return res.data;
    },
  });

  useEffect(() => {
    if (settings) {
      setGraceDays(String(settings.late_fee_grace_days));
      setFeePercent(String(settings.late_fee_percent_per_day));
      setBrandName(settings.brand_name || '');
      setOtpTemplate(settings.whatsapp_otp_template || '');
      setPayConfTemplate(settings.whatsapp_payment_confirmation_template || '');
      setNoticeTemplate(settings.whatsapp_generic_notice_template || '');
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.patch('/settings', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Settings saved successfully!', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, 1200);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Save failed', 'error');
    },
  });

  const handleSubmit = () => {
    const newErrors: { [key: string]: string } = {};
    
    const gd = parseInt(graceDays);
    if (isNaN(gd) || gd < 0 || gd > 30) {
      newErrors.graceDays = 'Grace days must be between 0 and 30';
    }

    const fp = parseFloat(feePercent);
    if (isNaN(fp) || fp < 0 || fp > 10) {
      newErrors.feePercent = 'Late fee percent must be between 0 and 10%';
    }

    if (!brandName || brandName.trim().length === 0) {
      newErrors.brandName = 'Brand name is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload = {
      late_fee_grace_days: gd,
      late_fee_percent_per_day: fp,
      brand_name: brandName.trim(),
      whatsapp_otp_template: otpTemplate.trim() || null,
      whatsapp_payment_confirmation_template: payConfTemplate.trim() || null,
      whatsapp_generic_notice_template: noticeTemplate.trim() || null,
    };

    updateSettingsMutation.mutate(payload);
  };

  const handleBack = () => navigation.goBack();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />
      
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Operating Settings
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Input
          label="Late Fee Grace Days"
          value={graceDays}
          onChangeText={setGraceDays}
          placeholder="0"
          keyboardType="numeric"
          error={errors.graceDays}
        />

        <Input
          label="Late Fee Percent Per Day (%)"
          value={feePercent}
          onChangeText={setFeePercent}
          placeholder="0.0"
          keyboardType="decimal-pad"
          error={errors.feePercent}
        />

        <Input
          label="Brand Name"
          value={brandName}
          onChangeText={setBrandName}
          placeholder="e.g. KaramStay Residences"
          error={errors.brandName}
        />

        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14, marginVertical: space.sm }}>
          WhatsApp Notice Templates
        </Text>

        <Input
          label="WhatsApp OTP Template"
          value={otpTemplate}
          onChangeText={setOtpTemplate}
          placeholder="otp_template_name"
        />

        <Input
          label="WhatsApp Payment Confirmation Template"
          value={payConfTemplate}
          onChangeText={setPayConfTemplate}
          placeholder="pay_confirm_template_name"
        />

        <Input
          label="WhatsApp Broadcast Notice Template"
          value={noticeTemplate}
          onChangeText={setNoticeTemplate}
          placeholder="notice_template_name"
        />

        <Button
          label="Save Settings"
          onPress={handleSubmit}
          loading={updateSettingsMutation.isPending || isLoading}
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
