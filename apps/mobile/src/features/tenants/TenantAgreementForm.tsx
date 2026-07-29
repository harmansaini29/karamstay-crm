/**
 * TenantAgreementForm.tsx
 *
 * Tenant-facing screen to fill in their legal agreement details.
 * Dynamically renders fields based on the assigned template (A / B / C).
 * On submit: PATCH /agreements/{id} with form_data, then POST compile-docx.
 *
 * Security:
 *   • Identity Number (Aadhaar/National ID) is masked in the UI on blur —
 *     the raw value is NEVER echoed in console logs, toasts, or Alert messages.
 *   • Sensitive fields are not stored in component state beyond form lifecycle.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { AgreementTrackerCard } from '../../components/AgreementTrackerCard';

// ─── Template definitions ─────────────────────────────────────────────────────

type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  sensitive?: boolean;        // triggers masking on blur
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'numeric' | 'email-address';
};

const TEMPLATE_FIELDS: Record<'A' | 'B' | 'C', FieldDef[]> = {
  A: [
    { key: 'full_name', label: 'Full Legal Name', placeholder: 'As per government ID' },
    { key: 'age', label: 'Age', placeholder: 'e.g. 28', keyboardType: 'numeric' },
    {
      key: 'identity_number',
      label: 'National ID Number',
      placeholder: 'Aadhaar / Passport / Voter ID',
      sensitive: true,
    },
    { key: 'phone', label: 'Phone Number', placeholder: '+91XXXXXXXXXX', keyboardType: 'phone-pad' },
    { key: 'emergency_contact', label: 'Emergency Contact', placeholder: 'Name / Phone Number' },
    { key: 'permanent_address', label: 'Permanent Address', placeholder: 'Full address with pin code', multiline: true },
    { key: 'office_address', label: 'Office / Work Address', placeholder: 'Workplace full address', multiline: true },
  ],
  B: [
    { key: 'full_name', label: 'Full Legal Name', placeholder: 'As per government ID' },
    { key: 'age', label: 'Age', placeholder: 'e.g. 28', keyboardType: 'numeric' },
    {
      key: 'identity_number',
      label: 'National ID Number',
      placeholder: 'Aadhaar / Passport / Voter ID',
      sensitive: true,
    },
    { key: 'phone', label: 'Phone Number', placeholder: '+91XXXXXXXXXX', keyboardType: 'phone-pad' },
    { key: 'emergency_contact', label: 'Emergency Contact', placeholder: 'Name / Phone Number' },
    { key: 'guardian_name', label: 'Guardian Name', placeholder: 'Parent / Spouse name (if applicable)' },
    { key: 'guardian_phone', label: 'Guardian Phone', placeholder: '+91XXXXXXXXXX', keyboardType: 'phone-pad' },
    { key: 'permanent_address', label: 'Permanent Address', placeholder: 'Full address with pin code', multiline: true },
    { key: 'office_address', label: 'Office / Work Address', placeholder: 'Workplace full address', multiline: true },
    { key: 'workplace_contact', label: 'Workplace HR Contact', placeholder: 'Name / Email / Phone' },
    { key: 'vehicle_registration', label: 'Vehicle Registration (optional)', placeholder: 'e.g. DL 9C AB 1234' },
  ],
  C: [
    { key: 'full_name', label: 'Full Legal Name', placeholder: 'As per government ID' },
    { key: 'age', label: 'Age', placeholder: 'e.g. 28', keyboardType: 'numeric' },
    {
      key: 'identity_number',
      label: 'National ID Number',
      placeholder: 'Aadhaar / Passport / Voter ID',
      sensitive: true,
    },
    { key: 'phone', label: 'Phone Number', placeholder: '+91XXXXXXXXXX', keyboardType: 'phone-pad' },
    { key: 'emergency_contact', label: 'Emergency Contact', placeholder: 'Name / Phone Number' },
    { key: 'permanent_address', label: 'Permanent Address', placeholder: 'Full address with pin code', multiline: true },
    { key: 'short_stay_purpose', label: 'Purpose of Short Stay', placeholder: 'e.g. Work assignment / Medical / Tourism' },
    { key: 'expected_checkout_date', label: 'Expected Checkout Date', placeholder: 'YYYY-MM-DD' },
  ],
};

// ─── Component ─────────────────────────────────────────────────────────────

export const TenantAgreementForm: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { agreementId } = route.params as { agreementId: number };
  const { colors, font, space } = useTheme();
  const qc = useQueryClient();

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [maskedFields, setMaskedFields] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: agreement,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<any>({
    queryKey: ['agreement', agreementId],
    queryFn: async () => {
      const res = await apiClient.get(`/agreements/${agreementId}`);
      return res.data;
    },
    onSuccess: (data: any) => {
      // Pre-fill if the tenant has already partially submitted
      if (data?.form_data && Object.keys(data.form_data).length > 0) {
        setFormValues(data.form_data);
        setSubmitted(data.tracker_stage >= 1);
      }
    },
  } as any);

  const templateId: 'A' | 'B' | 'C' = agreement?.template_id ?? 'A';
  const fields = TEMPLATE_FIELDS[templateId] ?? TEMPLATE_FIELDS['A'];

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    for (const field of fields) {
      if (!field.key.includes('optional') && !formValues[field.key]?.trim()) {
        return `${field.label} is required.`;
      }
    }
    return null;
  };

  // ── Mutations ──────────────────────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Mask identity number before sending (store only last 4 digits visible)
      const safeFormData: Record<string, string> = {};
      for (const [k, v] of Object.entries(formValues)) {
        if (k === 'identity_number') {
          safeFormData[k] = v.replace(/\d(?=\d{4})/g, '*');
        } else {
          safeFormData[k] = v;
        }
      }
      // Save form data
      await apiClient.patch(`/agreements/${agreementId}`, {
        form_data: safeFormData,
        tracker_stage: 1,
        status: 'form_submitted',
      });
      // Auto-compile docx after submission
      const compileRes = await apiClient.post(`/agreements/${agreementId}/compile-docx`);
      return compileRes.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement', agreementId] });
      qc.invalidateQueries({ queryKey: ['agreements', 'me'] });
      setSubmitted(true);
      Alert.alert(
        'Submitted Successfully',
        'Your agreement details have been submitted and the document is being prepared for review.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (err: any) => {
      Alert.alert('Submission Failed', parseApiError(err).message);
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  if (submitted && agreement?.tracker_stage >= 2) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ResponsiveContainer>
          <ScrollView contentContainerStyle={{ padding: space.lg, alignItems: 'center' }}>
            <View style={{ marginTop: 60, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={64} color={semanticColor.success.solid} />
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h2.fontSize, marginTop: 16, textAlign: 'center' }}>
                Agreement Submitted
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
                Your agreement details have been submitted and the document is under review by your property owner.
                {'\n\n'}You will be notified once it's approved and archived.
              </Text>
            </View>
            <View style={{ width: '100%', marginTop: 40 }}>
              <AgreementTrackerCard stage={agreement.tracker_stage} />
            </View>
            <Button label="Back to Home" onPress={() => navigation.goBack()} style={{ marginTop: 32, width: '100%' }} />
          </ScrollView>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>Agreement Form</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: space.lg }}>
            {/* Template banner */}
            <Card style={{ borderWidth: 1, marginBottom: space.md, flexDirection: 'row', alignItems: 'center', padding: 12 }}>
              <Ionicons name="document-text-outline" size={22} color={colors.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>
                  {agreement?.template_name ?? 'Agreement'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  Please fill all fields carefully. Your submitted details will be compiled into a legal document.
                </Text>
              </View>
            </Card>

            {/* Dynamic fields */}
            {fields.map((field) => {
              const isMasked = field.sensitive && maskedFields[field.key];
              const displayValue = isMasked
                ? (formValues[field.key] || '').replace(/\d(?=\d{4})/g, '*')
                : formValues[field.key] || '';

              return (
                <View key={field.key} style={{ marginBottom: space.md }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                    {field.label}
                    {field.sensitive && (
                      <Text style={{ color: semanticColor.warning.fg }}> (Sensitive — encrypted)</Text>
                    )}
                  </Text>
                  <Input
                    value={displayValue}
                    onChangeText={(t) => {
                      if (isMasked) return; // read-only while masked
                      setFormValues((prev) => ({ ...prev, [field.key]: t }));
                    }}
                    onFocus={() => {
                      if (field.sensitive) {
                        setMaskedFields((prev) => ({ ...prev, [field.key]: false }));
                      }
                    }}
                    onBlur={() => {
                      if (field.sensitive && formValues[field.key]) {
                        setMaskedFields((prev) => ({ ...prev, [field.key]: true }));
                      }
                    }}
                    placeholder={field.placeholder}
                    keyboardType={field.keyboardType ?? 'default'}
                    multiline={field.multiline}
                    secureTextEntry={false} // we do our own masking above
                    style={field.sensitive ? { borderColor: colors.primary + '60', borderWidth: 1.5 } : undefined}
                  />
                  {field.sensitive && (
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                      This field will be encrypted. Only masked digits are stored.
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Submit */}
            <Button
              label="Submit Agreement"
              loading={submitMutation.isPending}
              disabled={submitMutation.isPending}
              onPress={() => {
                const err = validate();
                if (err) {
                  Alert.alert('Incomplete Form', err);
                  return;
                }
                Alert.alert(
                  'Confirm Submission',
                  'By submitting, you confirm that all details provided are accurate and you agree to the tenancy terms.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Submit', onPress: () => submitMutation.mutate() },
                  ]
                );
              }}
              style={{ marginTop: space.md, marginBottom: space.xl }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

// ─── Inline tracker sub-component ────────────────────────────────────────────

const STAGE_LABELS = [
  'Form Submitted',
  'Docx Generated & Under Review',
  'Offline Stamp & Notary Verification',
  'Final Approval & Archived',
];

const AgreementTrackerInline: React.FC<{ stage: number; colors: any; font: any }> = ({
  stage,
  colors,
  font,
}) => (
  <View style={{ width: '100%' }}>
    {STAGE_LABELS.map((label, i) => {
      const n = i + 1;
      const done = stage >= n;
      return (
        <View key={n} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ alignItems: 'center', width: 28 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: done ? semanticColor.success.solid : colors.border,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name={done ? 'checkmark' : 'ellipse-outline'} size={12} color={done ? '#fff' : colors.textMuted} />
            </View>
            {i < STAGE_LABELS.length - 1 && (
              <View style={{ width: 2, height: 18, backgroundColor: done ? semanticColor.success.solid : colors.border, marginTop: 2 }} />
            )}
          </View>
          <Text
            style={{
              flex: 1,
              marginLeft: 10,
              paddingTop: 3,
              color: done ? colors.text : colors.textMuted,
              fontWeight: done ? '600' : '400',
              fontSize: font.caption.fontSize,
            }}
          >
            {label}
          </Text>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
});
