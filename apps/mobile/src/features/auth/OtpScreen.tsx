import React, { useState, useEffect } from 'react';
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

interface OtpScreenProps {
  route: any;
  navigation: any;
}

export const OtpScreen: React.FC<OtpScreenProps> = ({ route, navigation }) => {
  const { phone } = route.params || { phone: '' };
  const { colors, font, space, radius } = useTheme();
  const { verifyOtp, requestOtp } = useAuth();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [error, setError] = useState('');

  // Handle cooldown countdown
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  const handleVerify = async () => {
    if (!code) {
      setError('Verification code is required');
      return;
    }
    if (code.length < 4) {
      setError('Verification code is too short');
      return;
    }

    setError('');
    setIsLoading(true);
    const submittedCode = code.trim();
    try {
      await verifyOtp(phone, submittedCode);
      // Immediately clear the OTP value from state memory (DPDP & Secure Practice)
      setCode('');
      showToast('Login successful', 'success');
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('lockout') || errMsg.includes('too many') || errMsg.includes('429')) {
        showToast('Too many failed attempts. Account locked out. Please try again in 5 minutes.', 'error');
      } else {
        showToast(errMsg || 'Verification failed. Please check the code.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setIsLoading(true);
    try {
      await requestOtp(phone);
      setCooldown(30);
      showToast('OTP resent successfully', 'success');
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('lockout') || errMsg.includes('too many') || errMsg.includes('429')) {
        showToast('Too many attempts. Request rate limit exceeded. Please wait.', 'error');
      } else {
        showToast(errMsg || 'Failed to resend OTP', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

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

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xl }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>
              Back to Login
            </Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="lock-closed" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text, fontSize: font.h1.fontSize }]}>
              Enter Verification Code
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize }]}>
              We have sent a verification code to {phone}
            </Text>
          </View>

          <Card style={styles.cardContainer}>
            <Input
              label="OTP Code"
              value={code}
              onChangeText={setCode}
              placeholder="XXXXXX"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              error={error}
            />

            <Button
              label="Verify & Login"
              onPress={handleVerify}
              loading={isLoading}
              style={{ marginTop: space.sm, marginBottom: space.md }}
            />

            <View style={styles.resendContainer}>
              <Text style={{ color: colors.textMuted, fontSize: font.body.fontSize }}>
                Didn't receive code?{' '}
              </Text>
              <TouchableOpacity onPress={handleResend} disabled={cooldown > 0}>
                <Text
                  style={{
                    color: cooldown > 0 ? colors.textMuted : colors.primary,
                    fontWeight: 'bold',
                    fontSize: font.body.fontSize,
                  }}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
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
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  cardContainer: {
    padding: 20,
    borderWidth: 1,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
});
