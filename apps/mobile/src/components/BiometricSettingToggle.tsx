import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import {
  checkBiometricSupport,
  isBiometricsEnabled,
  setBiometricsEnabled,
  getBiometricSession,
  saveBiometricSession,
  clearBiometricSession,
  promptBiometricAuth,
  triggerHaptic,
  BiometricSupportStatus,
} from '../utils/biometrics';
import { useAuth } from '../features/auth/AuthContext';
import { storage } from '../utils/storage';

interface BiometricSettingToggleProps {
  onStatusChange?: (enabled: boolean) => void;
  style?: object;
}

export const BiometricSettingToggle: React.FC<BiometricSettingToggleProps> = ({
  onStatusChange,
  style,
}) => {
  const { colors, font, space, isDark } = useTheme();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [supportStatus, setSupportStatus] = useState<BiometricSupportStatus>({
    hasHardware: false,
    isEnrolled: false,
    biometricType: 'none',
    biometricLabel: 'Biometrics',
    iconName: 'finger-print-outline',
  });
  const [remainingDays, setRemainingDays] = useState<number | null>(null);

  useEffect(() => {
    loadBiometricState();
  }, []);

  const loadBiometricState = async () => {
    try {
      setIsLoading(true);
      const support = await checkBiometricSupport();
      setSupportStatus(support);

      const enabled = await isBiometricsEnabled();
      const sessionResult = await getBiometricSession();

      if (enabled) {
        setIsEnabled(true);
        setRemainingDays(sessionResult.isValid ? sessionResult.remainingDays : null);
      } else {
        setIsEnabled(false);
        setRemainingDays(null);
      }
    } catch (_e) {
      setIsEnabled(false);
      setRemainingDays(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (targetValue: boolean) => {
    if (isProcessing) return;

    if (!supportStatus.hasHardware) {
      Alert.alert(
        'Not Supported',
        'Your device does not have biometric authentication hardware.'
      );
      return;
    }

    if (!supportStatus.isEnrolled) {
      Alert.alert(
        'Biometrics Not Enrolled',
        `No biometrics are set up on this device. Please enroll your ${supportStatus.biometricLabel} in your device System Settings first.`
      );
      return;
    }

    setIsProcessing(true);

    try {
      if (targetValue) {
        // Prompt biometrics immediately to confirm identity before enabling
        const auth = await promptBiometricAuth(
          `Authenticate with ${supportStatus.biometricLabel} to enable 7-day quick login`
        );

        if (!auth.success) {
          if (!auth.isCanceled && !auth.isFallback) {
            Alert.alert(
              'Authentication Failed',
              auth.error || 'Could not verify biometric identity. Setting not updated.'
            );
          }
          setIsProcessing(false);
          return;
        }

        // Retrieve current active tokens
        const accessToken = await storage.getItem('access_token');
        const refreshToken = await storage.getItem('refresh_token');

        if (!accessToken || !refreshToken || !user) {
          Alert.alert(
            'Session Error',
            'Could not find active session credentials. Please sign in again.'
          );
          setIsProcessing(false);
          return;
        }

        const isTenant = user.role.name === 'tenant';
        await saveBiometricSession({
          accessToken,
          refreshToken,
          userId: user.id,
          userName: user.name,
          userRole: user.role.name,
          userIdentifier: (user.email && user.email.trim()) || user.phone,
          portalType: isTenant ? 'tenant' : 'staff',
        });

        setIsEnabled(true);
        setRemainingDays(7);
        triggerHaptic('success');
        onStatusChange?.(true);

        Alert.alert(
          'Biometrics Enabled',
          `${supportStatus.biometricLabel} login is now active for a 7-day period. You can quickly log in using your biometrics.`
        );
      } else {
        // Disable biometrics and clear stored session
        await setBiometricsEnabled(false);
        await clearBiometricSession();
        setIsEnabled(false);
        setRemainingDays(null);
        triggerHaptic('impactLight');
        onStatusChange?.(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update biometric settings');
    } finally {
      setIsProcessing(false);
    }
  };

  const isHardwareUnavailable = !supportStatus.hasHardware || !supportStatus.isEnrolled;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
        },
        style,
      ]}
    >
      <View style={styles.contentRow}>
        {/* Leading Icon */}
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: isEnabled
                ? colors.primary + '16'
                : isDark
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(0,0,0,0.04)',
            },
          ]}
        >
          <Ionicons
            name={supportStatus.iconName}
            size={22}
            color={isEnabled ? colors.primary : colors.textMuted}
          />
        </View>

        {/* Text information */}
        <View style={styles.textWrap}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
              Biometric Login ({supportStatus.biometricLabel})
            </Text>
            {isEnabled && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: remainingDays !== null
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(245, 158, 11, 0.12)',
                    borderColor: remainingDays !== null
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'rgba(245, 158, 11, 0.3)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: remainingDays !== null ? '#10B981' : '#F59E0B' },
                  ]}
                >
                  {remainingDays !== null ? `${remainingDays}d active` : 'Active'}
                </Text>
              </View>
            )}
          </View>

          <Text
            style={[
              styles.subtitle,
              { color: colors.textMuted, fontSize: font.caption.fontSize },
            ]}
          >
            {isHardwareUnavailable
              ? supportStatus.biometricLabel
              : isEnabled
              ? `7-day quick access enabled using ${supportStatus.biometricLabel}`
              : `Enable fast 7-day sign-in using ${supportStatus.biometricLabel}`}
          </Text>
        </View>

        {/* Switch or Loader */}
        {isLoading || isProcessing ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
        ) : (
          <Switch
            value={isEnabled}
            onValueChange={handleToggle}
            disabled={isHardwareUnavailable || isProcessing}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={isEnabled ? '#FFFFFF' : colors.textMuted}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 6,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
    marginRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  title: {
    fontWeight: '600',
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 16,
    marginTop: 2,
  },
});
