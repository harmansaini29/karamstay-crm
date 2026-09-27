import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from './Card';
import { BiometricSessionData, BiometricSupportStatus, triggerHaptic } from '../utils/biometrics';

interface BiometricPromptCardProps {
  supportStatus: BiometricSupportStatus;
  sessionData: BiometricSessionData | null;
  remainingDays: number;
  remainingHours?: number;
  isExpired?: boolean;
  isLoading?: boolean;
  onAuthenticate: () => void;
  onFallbackToManual: () => void;
  onClearAccount?: () => void;
  style?: object;
}

export const BiometricPromptCard: React.FC<BiometricPromptCardProps> = ({
  supportStatus,
  sessionData,
  remainingDays,
  remainingHours,
  isExpired = false,
  isLoading = false,
  onAuthenticate,
  onFallbackToManual,
  onClearAccount,
  style,
}) => {
  const { colors, font, space, radius, isDark } = useTheme();

  // Animation values
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Subtle pulsing animation for biometric ring (only active when not expired)
  useEffect(() => {
    if (isExpired) return;

    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.25,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 1200,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.05,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.35,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulseScale, pulseOpacity, isExpired]);

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1.0,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  };

  const handleTriggerAuth = () => {
    triggerHaptic('impactLight');
    onAuthenticate();
  };

  const roleLabel = (sessionData?.userRole || 'USER').toUpperCase();
  const userName = sessionData?.userName || 'User';
  const biometricLabel = supportStatus.biometricLabel || 'Biometrics';
  const iconName = supportStatus.iconName || 'finger-print-outline';

  const timeCountdownText =
    remainingDays > 1
      ? `${remainingDays}d remaining`
      : remainingHours && remainingHours > 1
      ? `${remainingHours}h remaining`
      : '< 1h remaining';

  return (
    <Card
      style={[
        styles.card,
        {
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          backgroundColor: colors.surface,
          shadowColor: colors.primary,
          shadowOpacity: isDark ? 0.25 : 0.08,
        },
        style,
      ]}
    >
      {/* 7-Day Session Validity Badge */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.sessionPill,
            {
              backgroundColor: isExpired
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(16, 185, 129, 0.12)',
              borderColor: isExpired
                ? 'rgba(239, 68, 68, 0.3)'
                : 'rgba(16, 185, 129, 0.3)',
            },
          ]}
        >
          <Ionicons
            name={isExpired ? 'time-outline' : 'shield-checkmark'}
            size={12}
            color={isExpired ? '#EF4444' : '#10B981'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.sessionPillText,
              { color: isExpired ? '#EF4444' : '#10B981' },
            ]}
          >
            {isExpired
              ? '7-Day Session Expired'
              : `7-Day Active Session • ${timeCountdownText}`}
          </Text>
        </View>

        {sessionData?.userRole && (
          <View
            style={[
              styles.rolePill,
              {
                backgroundColor: colors.primary + '14',
                borderColor: colors.primary + '30',
              },
            ]}
          >
            <Text style={[styles.rolePillText, { color: colors.primary }]}>
              {roleLabel}
            </Text>
          </View>
        )}
      </View>

      {/* User Greeting */}
      <View style={styles.userSection}>
        <Text style={[styles.welcomeTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Welcome back, {userName}
        </Text>
        <Text
          style={[
            styles.userSubtitle,
            { color: colors.textMuted, fontSize: font.caption.fontSize },
          ]}
        >
          {isExpired
            ? 'Your 7-day biometric authorization has expired. Please sign in below to establish a new 7-day window.'
            : `Instantly access your account using ${biometricLabel}`}
        </Text>
      </View>

      {/* Animated Biometric Fingerprint/FaceID Orb */}
      {!isExpired && (
        <View style={styles.orbContainer}>
          {/* Pulsing halo */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                borderColor: colors.primary,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* Interactive biometric button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={handleTriggerAuth}
              disabled={isLoading}
              style={[
                styles.biometricCircle,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                  shadowOpacity: isDark ? 0.45 : 0.35,
                  shadowOffset: { width: 0, height: 6 },
                  shadowRadius: 14,
                  elevation: 8,
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name={iconName} size={36} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Primary Action Button (Active vs Expired) */}
      {!isExpired ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleTriggerAuth}
          disabled={isLoading}
          style={[
            styles.primaryButton,
            {
              backgroundColor: colors.primary + '12',
              borderColor: colors.primary + '35',
            },
          ]}
        >
          <Ionicons
            name={iconName}
            size={18}
            color={colors.primary}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.primaryButtonText, { color: colors.primary }]}>
            {isLoading ? 'Verifying...' : `Unlock with ${biometricLabel}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onFallbackToManual}
          style={[
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
            },
          ]}
        >
          <Ionicons
            name="lock-open-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>
            Renew 7-Day Session with Password / OTP
          </Text>
        </TouchableOpacity>
      )}

      {/* Fallback Option */}
      {!isExpired && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onFallbackToManual}
          style={styles.fallbackButton}
        >
          <Text style={[styles.fallbackText, { color: colors.textMuted }]}>
            Switch to Password or Phone OTP
          </Text>
        </TouchableOpacity>
      )}

      {/* Account Switching / Removal Option */}
      {onClearAccount && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onClearAccount}
          style={styles.switchAccountButton}
        >
          <Text style={[styles.switchAccountText, { color: colors.textMuted }]}>
            Not {userName}? Switch account
          </Text>
        </TouchableOpacity>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  sessionPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  userSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  userSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    marginVertical: 4,
  },
  pulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
  },
  biometricCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  fallbackButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  fallbackText: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  switchAccountButton: {
    alignItems: 'center',
    paddingVertical: 6,
    marginTop: 2,
  },
  switchAccountText: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.8,
  },
});
