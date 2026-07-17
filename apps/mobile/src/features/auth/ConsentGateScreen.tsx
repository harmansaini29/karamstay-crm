import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from './AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Button } from '../../components/Button';
import { apiClient, parseApiError } from '../../api/client';
import { Ionicons } from '@expo/vector-icons';

const consentSchema = z.object({
  primaryConsent: z.boolean().refine((val) => val === true, {
    message: 'You must consent to proceed',
  }),
  whatsappNotifications: z.boolean(),
  pushNotifications: z.boolean(),
});

type ConsentFormValues = z.infer<typeof consentSchema>;

export const ConsentGateScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { setHasAcceptedConsent, logout } = useAuth();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ConsentFormValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: {
      primaryConsent: false, // Default unchecked (DPDP Act compliance)
      whatsappNotifications: true,
      pushNotifications: true,
    },
    mode: 'onChange',
  });

  const onSubmit = async (values: ConsentFormValues) => {
    try {
      // 1. Submit primary data consent
      await apiClient.post('/consents', {
        consent_type: 'primary_data',
        granted: values.primaryConsent,
        policy_version: '1.0',
      });

      // 2. Submit whatsapp notifications consent
      await apiClient.post('/consents', {
        consent_type: 'whatsapp_notifications',
        granted: values.whatsappNotifications,
        policy_version: '1.0',
      });

      // 3. Submit push notifications consent
      await apiClient.post('/consents', {
        consent_type: 'push_notifications',
        granted: values.pushNotifications,
        policy_version: '1.0',
      });

      setHasAcceptedConsent(true);
    } catch (err: any) {
      Alert.alert('Consent Submission Failed', parseApiError(err).message || 'An error occurred.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text, fontSize: font.h1.fontSize }]}>
            Privacy & Consent Gate
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize }]}>
            In compliance with India's DPDP Act, 2023, we require your explicit consent to manage your tenancy information.
          </Text>
        </View>

        {/* Informative summary card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.xs }}>
            What data do we collect?
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, lineHeight: 18, marginBottom: space.sm }}>
            • Contact info (Name, Phone, Email) for tenancy logs.{"\n"}
            • Legal IDs & Signed agreements for compliance.{"\n"}
            • Financial transactions & rent records for account ledger.
          </Text>

          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.xs }}>
            Why do we need this data?
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, lineHeight: 18 }}>
            To generate rent invoices, process payments, log maintenance tickets, notify you of updates, and preserve legal contract records.
          </Text>
        </View>

        {/* Consents list */}
        <View style={{ marginBottom: space.lg }}>
          {/* WhatsApp switch */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: space.sm }}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                WhatsApp Notifications
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                Receive rent receipts, alerts, and due templates directly.
              </Text>
            </View>
            <Controller
              control={control}
              name="whatsappNotifications"
              render={({ field: { value, onChange } }) => (
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={value ? '#FFFFFF' : colors.textMuted}
                />
              )}
            />
          </View>

          {/* Push switch */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: space.sm }}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                Push Notifications
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                Receive real-time complaint updates and broadcast alerts.
              </Text>
            </View>
            <Controller
              control={control}
              name="pushNotifications"
              render={({ field: { value, onChange } }) => (
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={value ? '#FFFFFF' : colors.textMuted}
                />
              )}
            />
          </View>

          {/* Main DPDP check box */}
          <View style={[styles.checkboxContainer, { borderColor: errors.primaryConsent ? semanticColor.error.solid : colors.border }]}>
            <Controller
              control={control}
              name="primaryConsent"
              render={({ field: { value, onChange } }) => (
                <TouchableOpacity
                  style={[styles.checkbox, { borderColor: value ? colors.primary : colors.textMuted, backgroundColor: value ? colors.primary : 'transparent' }]}
                  onPress={() => onChange(!value)}
                >
                  {value && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </TouchableOpacity>
              )}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: font.caption.fontSize, lineHeight: 18 }}>
                I consent to the collection, processing, and storage of my personal data for the tenancy management lifecycle.
              </Text>
              {errors.primaryConsent && (
                <Text style={{ color: semanticColor.error.solid, fontSize: 11, fontWeight: 'bold', marginTop: space.xs }}>
                  {errors.primaryConsent.message}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Links to policy */}
        <View style={styles.linksRow}>
          <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
            <Text style={{ color: colors.primary, fontSize: font.caption.fontSize, fontWeight: '600' }}>
              Privacy Policy
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted, marginHorizontal: 8 }}>·</Text>
          <TouchableOpacity onPress={() => navigation.navigate('TermsOfService')}>
            <Text style={{ color: colors.primary, fontSize: font.caption.fontSize, fontWeight: '600' }}>
              Terms of Service
            </Text>
          </TouchableOpacity>
        </View>

        <Button
          label="Agree and Proceed"
          onPress={handleSubmit(onSubmit)}
          disabled={!isValid || isSubmitting}
          loading={isSubmitting}
          style={{ marginBottom: space.md }}
        />

        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={{ color: semanticColor.error.solid, fontWeight: '600', fontSize: font.body.fontSize }}>
            Log Out Account
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  logoutBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
