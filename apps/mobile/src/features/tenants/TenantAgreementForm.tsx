/**
 * TenantAgreementForm.tsx
 *
 * Tenant-facing screen to fill in their Paying Guest Details Form and finalize agreement.
 * Strictly implements the Paying Guest Agreement form format:
 *   • Personal Details: Salutation (Ms./Mr.), First Name, Last Name, Age,
 *     Permanent Address (as per Aadhar), State, Permanent Pincode,
 *     Aadhar Card Number, Office Address, Office Pincode, Email ID.
 *   • Reference Contacts: Ref 1 Name (e.g. Father/Mother), Ref 1 Phone,
 *     Ref 2 Name, Ref 2 Phone.
 *   • Agreement Terms: Rented Property Address, Monthly Rent (INR),
 *     Security Deposit (INR), Agreement Start Date.
 *   • Uploads & Signature: Aadhar card upload, Passport-size photo upload,
 *     interactive signature drawing pad with Clear & Submit.
 *
 * On submit: POST /agreements/{id}/submit-kyc, which compiles the .docx and .pdf
 * Word documents and notifies the owner and staff on the spot.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';
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
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { AgreementTrackerCard } from '../../components/AgreementTrackerCard';

interface FormDataState {
  salutation: 'Ms' | 'Mr';
  first_name: string;
  last_name: string;
  age: string;
  address: string;
  state: string;
  permanent_pincode: string;
  aadhar_no: string;
  office_address: string;
  office_pincode: string;
  email_id: string;
  ref1_name: string;
  ref1_number: string;
  ref2_name: string;
  ref2_number: string;
  rented_address: string;
  rent_price: string;
  security_deposit: string;
  start_date: string;
}

const SIGNATURE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { box-sizing: border-box; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background-color:#F9FAFB; }
    #canvas-wrap { width:100%; height:100%; position:relative; }
    canvas { width:100%; height:100%; display:block; touch-action:none; }
  </style>
</head>
<body>
  <div id="canvas-wrap">
    <canvas id="c"></canvas>
  </div>
  <script>
    var canvas = document.getElementById('c');
    var ctx = canvas.getContext('2d');
    var drawing = false;
    var hasStroke = false;

    function resizeCanvas() {
      var ratio = window.devicePixelRatio || 1;
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = '#1E3A8A';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDraw(e) {
      drawing = true;
      hasStroke = true;
      var pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      if (e.cancelable) e.preventDefault();
    }

    function moveDraw(e) {
      if (!drawing) return;
      var pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      if (e.cancelable) e.preventDefault();
    }

    function stopDraw(e) {
      if (!drawing) return;
      drawing = false;
      if (window.ReactNativeWebView && hasStroke) {
        var dataUrl = canvas.toDataURL('image/png');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', data: dataUrl }));
      }
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    window.addEventListener('touchend', stopDraw);

    window.clearCanvas = function() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasStroke = false;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clear' }));
      }
    };
  </script>
</body>
</html>
`;

export const TenantAgreementForm: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { agreementId } = route.params as { agreementId: number };
  const { colors, font, space, radius } = useTheme();
  const { contentBottomPadding, horizontalGutter } = useResponsiveLayout();
  const qc = useQueryClient();
  const webViewRef = useRef<WebView>(null);

  const getTodayFormatted = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [formData, setFormData] = useState<FormDataState>({
    salutation: 'Ms',
    first_name: '',
    last_name: '',
    age: '',
    address: '',
    state: '',
    permanent_pincode: '',
    aadhar_no: '',
    office_address: '',
    office_pincode: '',
    email_id: '',
    ref1_name: '',
    ref1_number: '',
    ref2_name: '',
    ref2_number: '',
    rented_address: '',
    rent_price: '',
    security_deposit: '',
    start_date: getTodayFormatted(),
  });

  const [tenantPhoto, setTenantPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [aadharCard, setAadharCard] = useState<{ uri: string; base64: string } | null>(null);
  const [signature, setSignature] = useState<{ uri: string; base64: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isMaskedAadhar, setIsMaskedAadhar] = useState(false);

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
  });

  // Fetch tenant's tenancy details to prefill rent, deposit, property address
  const { data: tenancies = [] } = useQuery<any[]>({
    queryKey: ['my-tenancies'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/tenancies');
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
  });

  useEffect(() => {
    if (agreement?.form_data && Object.keys(agreement.form_data).length > 0) {
      const saved = agreement.form_data;
      setFormData((prev) => ({
        ...prev,
        salutation: saved.salutation === 'Mr' ? 'Mr' : 'Ms',
        first_name: saved.first_name || prev.first_name,
        last_name: saved.last_name || prev.last_name,
        age: saved.age ? String(saved.age) : prev.age,
        address: saved.address || saved.permanent_address || prev.address,
        state: saved.state || prev.state,
        permanent_pincode: saved.permanent_pincode || prev.permanent_pincode,
        aadhar_no: saved.aadhar_no || saved.identity_number || prev.aadhar_no,
        office_address: saved.office_address || prev.office_address,
        office_pincode: saved.office_pincode || prev.office_pincode,
        email_id: saved.email_id || prev.email_id,
        ref1_name: saved.ref1_name || prev.ref1_name,
        ref1_number: saved.ref1_number || prev.ref1_number,
        ref2_name: saved.ref2_name || prev.ref2_name,
        ref2_number: saved.ref2_number || prev.ref2_number,
        rented_address: saved.rented_address || prev.rented_address,
        rent_price: saved.rent_price ? String(saved.rent_price) : prev.rent_price,
        security_deposit: saved.security_deposit ? String(saved.security_deposit) : prev.security_deposit,
        start_date: saved.start_date || prev.start_date,
      }));
    } else if (tenancies.length > 0) {
      const activeTenancy = tenancies[0];
      setFormData((prev) => ({
        ...prev,
        rent_price: prev.rent_price || (activeTenancy.monthly_rent ? String(Math.round(activeTenancy.monthly_rent)) : ''),
        security_deposit: prev.security_deposit || (activeTenancy.security_deposit ? String(Math.round(activeTenancy.security_deposit)) : ''),
        start_date: prev.start_date || (activeTenancy.start_date ? activeTenancy.start_date.split('T')[0] : getTodayFormatted()),
      }));
    }

    if (agreement?.tracker_stage >= 2 || agreement?.status === 'docx_generated' || agreement?.status === 'approved') {
      setSubmitted(true);
    }
  }, [agreement, tenancies]);

  const updateField = (field: keyof FormDataState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ── Document Pickers ───────────────────────────────────────────────────────

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Gallery access is required to select photograph.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        let b64 = asset.base64;
        if (!b64 && asset.uri) {
          try {
            b64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
            });
          } catch {}
        }
        setTenantPhoto({ uri: asset.uri, base64: b64 || '' });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not pick photograph');
    }
  };

  const pickAadhar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Gallery access is required to select Aadhaar document.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        let b64 = asset.base64;
        if (!b64 && asset.uri) {
          try {
            b64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
            });
          } catch {}
        }
        setAadharCard({ uri: asset.uri, base64: b64 || '' });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not pick Aadhaar document');
    }
  };

  const pickSignatureFile = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Gallery access is required to select signature file.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        let b64 = asset.base64;
        if (!b64 && asset.uri) {
          try {
            b64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
            });
          } catch {}
        }
        setSignature({ uri: asset.uri, base64: b64 || '' });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not pick signature');
    }
  };

  const handleClearSignature = () => {
    setSignature(null);
    webViewRef.current?.injectJavaScript('window.clearCanvas(); true;');
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!formData.first_name.trim()) return 'First Name is required.';
    if (!formData.last_name.trim()) return 'Last Name is required.';
    if (!formData.age.trim() || isNaN(Number(formData.age)) || Number(formData.age) < 18) {
      return 'Please enter a valid adult age (18+).';
    }
    if (!formData.address.trim()) return 'Permanent Address (as per Aadhar) is required.';
    if (!formData.state.trim()) return 'State is required.';
    if (!formData.permanent_pincode.trim() || formData.permanent_pincode.replace(/\D/g, '').length !== 6) {
      return 'Please enter a valid 6-digit Permanent Pincode.';
    }
    const cleanAadhar = formData.aadhar_no.replace(/\D/g, '');
    if (!formData.aadhar_no.trim() || cleanAadhar.length !== 12) {
      return 'Please enter a valid 12-digit Aadhar Card Number.';
    }
    if (!formData.ref1_name.trim()) return 'Reference 1 Name is required.';
    if (!formData.ref1_number.trim() || formData.ref1_number.replace(/\D/g, '').length < 10) {
      return 'Please enter a valid 10-digit Reference 1 Number.';
    }
    if (!formData.ref2_name.trim()) return 'Reference 2 Name is required.';
    if (!formData.ref2_number.trim() || formData.ref2_number.replace(/\D/g, '').length < 10) {
      return 'Please enter a valid 10-digit Reference 2 Number.';
    }
    if (!formData.rented_address.trim()) return 'Rented Property Address is required.';
    if (!formData.rent_price.trim() || isNaN(Number(formData.rent_price))) {
      return 'Please enter a valid Monthly Rent (INR).';
    }
    if (!formData.security_deposit.trim() || isNaN(Number(formData.security_deposit))) {
      return 'Please enter a valid Security Deposit (INR).';
    }
    if (!formData.start_date.trim()) return 'Agreement Start Date is required.';

    if (!aadharCard && !agreement?.aadhar_card_key) {
      return 'Please upload your Aadhar card photocopy.';
    }
    if (!tenantPhoto && !agreement?.tenant_photo_key) {
      return 'Please upload your Passport-size photo.';
    }
    if (!signature && !agreement?.signature_key) {
      return 'Please draw or upload your signature.';
    }
    return null;
  };

  // ── Submission ─────────────────────────────────────────────────────────────

  const handleGoBack = () => {
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation?.navigate?.('TenantDashboard');
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/agreements/${agreementId}/submit-kyc`, {
        form_data: {
          ...formData,
          full_name: `${formData.first_name} ${formData.last_name}`.trim(),
          permanent_address: formData.address,
        },
        tenant_photo_base64: tenantPhoto?.base64,
        aadhar_card_base64: aadharCard?.base64,
        signature_base64: signature?.base64,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement', agreementId] });
      qc.invalidateQueries({ queryKey: ['agreements'] });
      qc.invalidateQueries({ queryKey: ['my-agreements'] });
      setSubmitted(true);
      Alert.alert(
        'Thank You!',
        'Your details have been submitted successfully and the agreement is being generated.',
        [{ text: 'OK', onPress: handleGoBack }]
      );
    },
    onError: (err: any) => {
      Alert.alert('Submission Failed', parseApiError(err).message);
    },
  });

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  if (submitted && agreement?.tracker_stage >= 2) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.bg }]}>
        <ResponsiveContainer>
          <ScrollView contentContainerStyle={{ padding: space.lg, alignItems: 'center' }}>
            <View style={{ marginTop: 40, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={68} color={semanticColor.success.solid} />
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h2.fontSize, marginTop: 16, textAlign: 'center' }}>
                Agreement Submitted
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
                Your agreement Word document has been generated and submitted to your property owner and staff for verification.
              </Text>
            </View>
            <View style={{ width: '100%', marginTop: 32 }}>
              <AgreementTrackerCard stage={agreement.tracker_stage} />
            </View>
            <Button label="Back to Home" onPress={handleGoBack} style={{ marginTop: 32, width: '100%' }} />
          </ScrollView>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleGoBack}>
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>Agreement Form</Text>
            <View style={{ width: 45 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: horizontalGutter, paddingBottom: contentBottomPadding + 50 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title Banner */}
            <View style={{ marginBottom: space.lg, marginTop: space.xs }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>
                Paying Guest Details Form
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                Please fill in your details below to finalize the agreement.
              </Text>
            </View>

            {/* ── SECTION 1: PERSONAL DETAILS ── */}
            <Card style={{ borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.lg }}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Personal Details</Text>
              </View>

              {/* Salutation Selector */}
              <View style={{ marginBottom: space.md }}>
                <Text style={styles.fieldLabel}>Salutation *</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                  {(['Ms', 'Mr'] as const).map((sal) => {
                    const isSelected = formData.salutation === sal;
                    return (
                      <TouchableOpacity
                        key={sal}
                        onPress={() => updateField('salutation', sal)}
                        activeOpacity={0.8}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 10,
                          borderRadius: 8,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary + '12' : colors.surface,
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                          size={16}
                          color={isSelected ? colors.primary : colors.textMuted}
                        />
                        <Text style={{ color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? '700' : '500', fontSize: 14 }}>
                          {sal}.
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* First & Last Name */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>First Name *</Text>
                  <Input
                    value={formData.first_name}
                    onChangeText={(t) => updateField('first_name', t)}
                    placeholder="First Name"
                    style={{ marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Last Name *</Text>
                  <Input
                    value={formData.last_name}
                    onChangeText={(t) => updateField('last_name', t)}
                    placeholder="Last Name"
                    style={{ marginTop: 4 }}
                  />
                </View>
              </View>

              {/* Age */}
              <View style={{ marginBottom: space.md }}>
                <Text style={styles.fieldLabel}>Age *</Text>
                <Input
                  value={formData.age}
                  onChangeText={(t) => updateField('age', t.replace(/\D/g, ''))}
                  placeholder="e.g. 24"
                  keyboardType="numeric"
                  style={{ marginTop: 4 }}
                />
              </View>

              {/* Permanent Address */}
              <View style={{ marginBottom: space.md }}>
                <Text style={styles.fieldLabel}>Permanent Address (as per Aadhar Card) *</Text>
                <Input
                  value={formData.address}
                  onChangeText={(t) => updateField('address', t)}
                  placeholder="Full permanent residential address"
                  multiline
                  style={{ marginTop: 4, minHeight: 70 }}
                />
              </View>

              {/* State & Permanent Pincode */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.md }}>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.fieldLabel}>State (Permanent Address) *</Text>
                  <Input
                    value={formData.state}
                    onChangeText={(t) => updateField('state', t)}
                    placeholder="e.g., Maharashtra"
                    style={{ marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 0.8 }}>
                  <Text style={styles.fieldLabel}>Pincode *</Text>
                  <Input
                    value={formData.permanent_pincode}
                    onChangeText={(t) => updateField('permanent_pincode', t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 digits"
                    keyboardType="numeric"
                    style={{ marginTop: 4 }}
                  />
                </View>
              </View>

              {/* Aadhar Card Number */}
              <View style={{ marginBottom: space.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.fieldLabel}>Aadhar Card Number *</Text>
                  <TouchableOpacity onPress={() => setIsMaskedAadhar(!isMaskedAadhar)}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                      {isMaskedAadhar ? 'Show' : 'Mask'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Input
                  value={
                    isMaskedAadhar
                      ? formData.aadhar_no.replace(/\d(?=\d{4})/g, '•')
                      : formData.aadhar_no
                  }
                  onChangeText={(t) => updateField('aadhar_no', t.replace(/\D/g, '').slice(0, 12))}
                  placeholder="12-digit Aadhar number"
                  keyboardType="numeric"
                  style={{ marginTop: 4 }}
                />
              </View>

              {/* Office Address & Office Pincode */}
              <View style={{ marginBottom: space.md }}>
                <Text style={styles.fieldLabel}>Office Address</Text>
                <Input
                  value={formData.office_address}
                  onChangeText={(t) => updateField('office_address', t)}
                  placeholder="Company name, building, street (optional)"
                  multiline
                  style={{ marginTop: 4 }}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Pincode (Office Address)</Text>
                  <Input
                    value={formData.office_pincode}
                    onChangeText={(t) => updateField('office_pincode', t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit pincode"
                    keyboardType="numeric"
                    style={{ marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.fieldLabel}>Email ID</Text>
                  <Input
                    value={formData.email_id}
                    onChangeText={(t) => updateField('email_id', t)}
                    placeholder="name@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={{ marginTop: 4 }}
                  />
                </View>
              </View>
            </Card>

            {/* ── SECTION 2: REFERENCE CONTACTS ── */}
            <Card style={{ borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.lg }}>
              <View style={styles.sectionHeader}>
                <Ionicons name="call-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Reference Contacts</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.md }}>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.fieldLabel}>Reference 1 Name (e.g., Father/Mother) *</Text>
                  <Input
                    value={formData.ref1_name}
                    onChangeText={(t) => updateField('ref1_name', t)}
                    placeholder="Guardian Name"
                    style={{ marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Reference 1 Number *</Text>
                  <Input
                    value={formData.ref1_number}
                    onChangeText={(t) => updateField('ref1_number', t.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10 digits"
                    keyboardType="phone-pad"
                    style={{ marginTop: 4 }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.fieldLabel}>Reference 2 Name *</Text>
                  <Input
                    value={formData.ref2_name}
                    onChangeText={(t) => updateField('ref2_name', t)}
                    placeholder="Friend / Relative"
                    style={{ marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Reference 2 Number *</Text>
                  <Input
                    value={formData.ref2_number}
                    onChangeText={(t) => updateField('ref2_number', t.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10 digits"
                    keyboardType="phone-pad"
                    style={{ marginTop: 4 }}
                  />
                </View>
              </View>
            </Card>

            {/* ── SECTION 3: AGREEMENT TERMS ── */}
            <Card style={{ borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.lg }}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Agreement Terms</Text>
              </View>

              <View style={{ marginBottom: space.md }}>
                <Text style={styles.fieldLabel}>Rented Property Address *</Text>
                <Input
                  value={formData.rented_address}
                  onChangeText={(t) => updateField('rented_address', t)}
                  placeholder="Property premises address"
                  multiline
                  style={{ marginTop: 4 }}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Monthly Rent (INR) *</Text>
                  <Input
                    value={formData.rent_price}
                    onChangeText={(t) => updateField('rent_price', t.replace(/\D/g, ''))}
                    placeholder="e.g. 12000"
                    keyboardType="numeric"
                    style={{ marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Security Deposit (INR) *</Text>
                  <Input
                    value={formData.security_deposit}
                    onChangeText={(t) => updateField('security_deposit', t.replace(/\D/g, ''))}
                    placeholder="e.g. 24000"
                    keyboardType="numeric"
                    style={{ marginTop: 4 }}
                  />
                </View>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Agreement Start Date *</Text>
                <Input
                  value={formData.start_date}
                  onChangeText={(t) => updateField('start_date', t)}
                  placeholder="YYYY-MM-DD or DD-MM-YYYY"
                  style={{ marginTop: 4 }}
                />
              </View>
            </Card>

            {/* ── SECTION 4: UPLOADS & SIGNATURE ── */}
            <Card style={{ borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.lg }}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Uploads & Signature</Text>
              </View>

              {/* 1. Aadhar Card Upload */}
              <View style={styles.uploadBlock}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.uploadLabel}>Aadhar card upload *</Text>
                  <TouchableOpacity onPress={pickAadhar} style={styles.uploadBtn}>
                    <Text style={styles.uploadBtnText}>{aadharCard ? 'Change' : 'Choose File'}</Text>
                  </TouchableOpacity>
                </View>
                {aadharCard?.uri ? (
                  <View style={styles.previewRow}>
                    <Image source={{ uri: aadharCard.uri }} style={styles.docThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docStatusReady}>Aadhaar Card Attached</Text>
                      <Text style={styles.docSub}>Ready for legal verification</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={pickAadhar} style={styles.uploadPlaceholder}>
                    <Ionicons name="card-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Upload Aadhaar card image</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 2. Passport Size Photo Upload */}
              <View style={styles.uploadBlock}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.uploadLabel}>Passportsize photo upload *</Text>
                  <TouchableOpacity onPress={pickPhoto} style={styles.uploadBtn}>
                    <Text style={styles.uploadBtnText}>{tenantPhoto ? 'Change' : 'Choose File'}</Text>
                  </TouchableOpacity>
                </View>
                {tenantPhoto?.uri ? (
                  <View style={styles.previewRow}>
                    <Image source={{ uri: tenantPhoto.uri }} style={styles.photoThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docStatusReady}>Photo Attached</Text>
                      <Text style={styles.docSub}>Ready for document embedding</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={pickPhoto} style={styles.uploadPlaceholder}>
                    <Ionicons name="camera-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Upload tenant headshot photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 3. Signature Pad */}
              <View style={{ marginTop: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.uploadLabel}>Signature *</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={handleClearSignature} style={styles.clearBtn}>
                      <Ionicons name="refresh-outline" size={14} color="#DC2626" style={{ marginRight: 3 }} />
                      <Text style={styles.clearBtnText}>Clear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={pickSignatureFile} style={styles.uploadBtn}>
                      <Text style={styles.uploadBtnText}>Upload File</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Interactive WebView Drawing Pad */}
                <View style={styles.signatureContainer}>
                  <WebView
                    ref={webViewRef}
                    originWhitelist={['*']}
                    source={{ html: SIGNATURE_HTML }}
                    style={{ flex: 1, backgroundColor: '#F9FAFB' }}
                    scrollEnabled={false}
                    javaScriptEnabled
                    onMessage={(event) => {
                      try {
                        const parsed = JSON.parse(event.nativeEvent.data);
                        if (parsed.type === 'signature' && parsed.data) {
                          setSignature({ uri: parsed.data, base64: parsed.data });
                        } else if (parsed.type === 'clear') {
                          setSignature(null);
                        }
                      } catch {}
                    }}
                  />
                  {!signature && (
                    <View style={styles.signatureWatermark} pointerEvents="none">
                      <Ionicons name="pencil-outline" size={18} color="#9CA3AF" />
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 6 }}>
                        Sign with your finger inside the box
                      </Text>
                    </View>
                  )}
                </View>

                {signature?.uri && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color={semanticColor.success.solid} />
                    <Text style={{ color: semanticColor.success.solid, fontSize: 12, fontWeight: '700' }}>
                      Signature Captured & Ready
                    </Text>
                  </View>
                )}
              </View>
            </Card>

            {/* ── SUBMIT BUTTON ── */}
            <Button
              label={submitMutation.isPending ? 'Submitting Details...' : 'Submit Details'}
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
                  'Your details will be compiled into a Paying Guest Word Agreement (.docx) and sent to the owner and staff.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Submit Details', onPress: () => submitMutation.mutate() },
                  ]
                );
              }}
              style={{ marginTop: space.sm, marginBottom: space.xl }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  uploadBlock: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  uploadLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  uploadBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  uploadBtnText: {
    color: '#4338CA',
    fontWeight: '700',
    fontSize: 11,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 11,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  docThumb: {
    width: 70,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  photoThumb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  docStatusReady: {
    color: '#059669',
    fontWeight: '700',
    fontSize: 12,
  },
  docSub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  uploadPlaceholder: {
    height: 48,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 8,
  },
  signatureContainer: {
    height: 180,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  signatureWatermark: {
    position: 'absolute',
    top: 10,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
