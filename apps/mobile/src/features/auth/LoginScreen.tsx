import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from './AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { colors, font, space, radius, shadows, isDark } = useTheme();
  const { login, requestOtp } = useAuth();

  // Mode: chooser, staff, tenant
  const [loginMode, setLoginMode] = useState<'chooser' | 'staff' | 'tenant'>('chooser');

  // Staff fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Tenant fields
  const [phone, setPhone] = useState('');

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  const handleStaffSubmit = async () => {
    // Validate
    const newErrors: { [key: string]: string } = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      showToast('Logged in successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTenantRequestOtp = async () => {
    // Validate
    const newErrors: { [key: string]: string } = {};
    if (!phone) newErrors.phone = 'Phone number is required';
    else if (phone.length < 8) newErrors.phone = 'Phone number is too short';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await requestOtp(phone.trim());
      // Navigate to OTP entry screen (always navigate to prevent user enumeration)
      navigation.navigate('Otp', { phone: phone.trim() });
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const activePortalShadow = isDark
    ? { ...shadows.sm, shadowColor: '#000000', shadowOpacity: 0.15 }
    : shadows.sm;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Toast
            message={toastMsg}
            visible={toastVisible}
            type={toastType}
            onDismiss={() => setToastVisible(false)}
          />

          {/* Logo / Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="home" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text, fontSize: font.h1.fontSize }]}>
              KaramStay
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize }]}>
              Custom enterprise operating system
            </Text>
          </View>

          {/* Chooser Screen */}
          {loginMode === 'chooser' ? (
            <Card style={styles.cardContainer}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                Welcome to KaramStay
              </Text>
              <Text style={[styles.cardDesc, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
                Please choose your login portal
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.portalButton, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, ...activePortalShadow }]}
                onPress={() => setLoginMode('staff')}
              >
                <Ionicons name="people" size={24} color={colors.primary} style={{ marginRight: space.md }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.portalTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                    Staff Portal
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                    Owner, Manager, Accountant
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.portalButton, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, ...activePortalShadow }]}
                onPress={() => setLoginMode('tenant')}
              >
                <Ionicons name="person" size={24} color={colors.primary} style={{ marginRight: space.md }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.portalTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                    Tenant Portal
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                    View rent, invoices, complaints
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </Card>
          ) : null}

          {/* Staff Login */}
          {loginMode === 'staff' ? (
            <Card style={styles.cardContainer}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}
                onPress={() => setLoginMode('chooser')}
              >
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
              </TouchableOpacity>

              <Text style={[styles.cardTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                Staff Login
              </Text>
              <Text style={[styles.cardDesc, { color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.lg }]}>
                Enter email & password to access your dashboard
              </Text>

              <Input
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                error={errors.email}
              />

              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="********"
                secureTextEntry
                error={errors.password}
              />

              <Button
                label="Login"
                onPress={handleStaffSubmit}
                loading={isLoading}
                style={{ marginTop: space.sm }}
              />
            </Card>
          ) : null}

          {/* Tenant OTP Login */}
          {loginMode === 'tenant' ? (
            <Card style={styles.cardContainer}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}
                onPress={() => setLoginMode('chooser')}
              >
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
              </TouchableOpacity>

              <Text style={[styles.cardTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                Tenant Login
              </Text>
              <Text style={[styles.cardDesc, { color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.lg }]}>
                Enter your registered phone number to receive a secure OTP code
              </Text>

              <Input
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 XXXXX XXXXX"
                keyboardType="phone-pad"
                error={errors.phone}
              />

              <Button
                label="Request OTP"
                onPress={handleTenantRequestOtp}
                loading={isLoading}
                style={{ marginTop: space.sm }}
              />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
  },
  cardContainer: {
    padding: 20,
    borderWidth: 1,
  },
  cardTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDesc: {
    marginBottom: 20,
  },
  portalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  portalTitle: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
});
