import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { storage } from './storage';

export const BIOMETRIC_STORAGE_KEY_ENABLED = 'karamstay_biometric_enabled';
export const BIOMETRIC_STORAGE_KEY_SESSION = 'karamstay_biometric_session';
export const BIOMETRIC_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'generic' | 'none';

export interface BiometricSupportStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricType: BiometricType;
  biometricLabel: string;
  iconName: 'scan-outline' | 'finger-print-outline' | 'shield-checkmark-outline';
}

export interface BiometricSessionData {
  accessToken: string;
  refreshToken: string;
  userId: number;
  userName: string;
  userRole: 'owner' | 'manager' | 'accountant' | 'tenant' | 'staff';
  userIdentifier: string; // Email or phone
  portalType: 'staff' | 'tenant';
  enrolledAt: number;
  expiresAt: number;
}

export interface BiometricCheckResult {
  session: BiometricSessionData | null;
  isValid: boolean;
  isExpired: boolean;
  remainingDays: number;
  remainingHours: number;
}

/**
 * Trigger tactile haptic feedback with safe web/hardware fallback
 */
export const triggerHaptic = async (
  type: 'impactLight' | 'impactMedium' | 'impactHeavy' | 'success' | 'warning' | 'error' = 'impactLight'
): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    switch (type) {
      case 'impactLight':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'impactMedium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'impactHeavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch (_e) {
    // Haptics may fail silently on some Android hardware or emulators
  }
};

/**
 * Check device biometric hardware and enrolled authentication types
 */
export const checkBiometricSupport = async (): Promise<BiometricSupportStatus> => {
  if (Platform.OS === 'web') {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricType: 'none',
      biometricLabel: 'Biometrics unavailable on web',
      iconName: 'shield-checkmark-outline',
    };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      return {
        hasHardware,
        isEnrolled,
        biometricType: 'none',
        biometricLabel: !hasHardware
          ? 'No biometric hardware found'
          : 'No biometrics registered on device',
        iconName: 'finger-print-outline',
      };
    }

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    const hasFace = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    );
    const hasFingerprint = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.FINGERPRINT
    );
    const hasIris = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.IRIS
    );

    let biometricType: BiometricType = 'generic';
    let biometricLabel = 'Biometric Authentication';
    let iconName: 'scan-outline' | 'finger-print-outline' | 'shield-checkmark-outline' =
      'finger-print-outline';

    if (Platform.OS === 'ios') {
      if (hasFace) {
        biometricType = 'face';
        biometricLabel = 'Face ID';
        iconName = 'scan-outline';
      } else if (hasFingerprint) {
        biometricType = 'fingerprint';
        biometricLabel = 'Touch ID';
        iconName = 'finger-print-outline';
      }
    } else {
      if (hasFace && hasFingerprint) {
        biometricType = 'fingerprint';
        biometricLabel = 'Fingerprint / Face';
        iconName = 'finger-print-outline';
      } else if (hasFingerprint) {
        biometricType = 'fingerprint';
        biometricLabel = 'Fingerprint';
        iconName = 'finger-print-outline';
      } else if (hasFace) {
        biometricType = 'face';
        biometricLabel = 'Face Unlock';
        iconName = 'scan-outline';
      } else if (hasIris) {
        biometricType = 'iris';
        biometricLabel = 'Iris Scanner';
        iconName = 'scan-outline';
      }
    }

    return {
      hasHardware: true,
      isEnrolled: true,
      biometricType,
      biometricLabel,
      iconName,
    };
  } catch (error) {
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricType: 'none',
      biometricLabel: 'Biometrics check error',
      iconName: 'shield-checkmark-outline',
    };
  }
};

/**
 * Check whether the user has toggled biometrics ON in app settings
 */
export const isBiometricsEnabled = async (): Promise<boolean> => {
  try {
    const val = await storage.getItem(BIOMETRIC_STORAGE_KEY_ENABLED);
    return val === 'true';
  } catch (_e) {
    return false;
  }
};

/**
 * Enable or disable biometrics in app settings
 */
export const setBiometricsEnabled = async (enabled: boolean): Promise<void> => {
  try {
    if (enabled) {
      await storage.setItem(BIOMETRIC_STORAGE_KEY_ENABLED, 'true');
    } else {
      await storage.setItem(BIOMETRIC_STORAGE_KEY_ENABLED, 'false');
      await clearBiometricSession();
    }
  } catch (_e) {}
};

/**
 * Synchronize newly rotated tokens into the persistent 7-day biometric session
 */
export const syncBiometricSessionTokens = async (
  accessToken: string,
  refreshToken: string
): Promise<void> => {
  try {
    const raw = await storage.getItem(BIOMETRIC_STORAGE_KEY_SESSION);
    if (!raw) return;
    const session: BiometricSessionData = JSON.parse(raw);
    const now = Date.now();
    // Only update if session has not expired
    if (session.expiresAt > now) {
      session.accessToken = accessToken;
      session.refreshToken = refreshToken;
      await storage.setItem(BIOMETRIC_STORAGE_KEY_SESSION, JSON.stringify(session));
    }
  } catch (_e) {}
};

/**
 * Retrieve the active 7-day biometric session and validate expiration
 */
export const getBiometricSession = async (): Promise<BiometricCheckResult> => {
  try {
    const isEnabled = await isBiometricsEnabled();
    if (!isEnabled) {
      return {
        session: null,
        isValid: false,
        isExpired: false,
        remainingDays: 0,
        remainingHours: 0,
      };
    }

    const raw = await storage.getItem(BIOMETRIC_STORAGE_KEY_SESSION);
    if (!raw) {
      return {
        session: null,
        isValid: false,
        isExpired: false,
        remainingDays: 0,
        remainingHours: 0,
      };
    }

    const session: BiometricSessionData = JSON.parse(raw);
    const now = Date.now();
    const remainingMs = session.expiresAt - now;

    if (remainingMs <= 0) {
      // 7-day session expired:
      // Strip sensitive tokens from memory so they can never be used to authenticate
      const expiredSessionMetadata: BiometricSessionData = {
        ...session,
        accessToken: '',
        refreshToken: '',
      };
      return {
        session: expiredSessionMetadata,
        isValid: false,
        isExpired: true,
        remainingDays: 0,
        remainingHours: 0,
      };
    }

    const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    return {
      session,
      isValid: true,
      isExpired: false,
      remainingDays,
      remainingHours,
    };
  } catch (error) {
    return {
      session: null,
      isValid: false,
      isExpired: false,
      remainingDays: 0,
      remainingHours: 0,
    };
  }
};

/**
 * Store an active session with strict 7-day expiration timestamp in expo-secure-store
 */
export const saveBiometricSession = async (params: {
  accessToken: string;
  refreshToken: string;
  userId: number;
  userName: string;
  userRole: 'owner' | 'manager' | 'accountant' | 'tenant' | 'staff';
  userIdentifier: string;
  portalType: 'staff' | 'tenant';
}): Promise<void> => {
  try {
    const now = Date.now();
    const expiresAt = now + BIOMETRIC_SESSION_DURATION_MS;

    const sessionData: BiometricSessionData = {
      ...params,
      enrolledAt: now,
      expiresAt,
    };

    await storage.setItem(BIOMETRIC_STORAGE_KEY_SESSION, JSON.stringify(sessionData));
    await storage.setItem(BIOMETRIC_STORAGE_KEY_ENABLED, 'true');
  } catch (_e) {}
};

/**
 * Clear the biometric session credentials from secure storage
 */
export const clearBiometricSession = async (): Promise<void> => {
  try {
    await storage.deleteItem(BIOMETRIC_STORAGE_KEY_SESSION);
  } catch (_e) {}
};

/**
 * Prompt the user for biometric scan (Face ID / Touch ID / Fingerprint)
 */
export const promptBiometricAuth = async (
  promptMessage = 'Verify your biometric identity to access KaramStay'
): Promise<{
  success: boolean;
  error?: string;
  isCanceled?: boolean;
  isFallback?: boolean;
}> => {
  if (Platform.OS === 'web') {
    return { success: false, error: 'Biometrics unavailable on web' };
  }

  try {
    const support = await checkBiometricSupport();
    if (!support.hasHardware) {
      return { success: false, error: 'Device does not support biometric authentication.' };
    }
    if (!support.isEnrolled) {
      return { success: false, error: 'No biometrics enrolled. Please set up Face ID or Fingerprint in device settings.' };
    }

    await triggerHaptic('impactLight');

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use Password or OTP',
      disableDeviceFallback: false,
    });

    if (result.success) {
      await triggerHaptic('success');
      return { success: true };
    }

    // Handle failure modes
    const errCode = (result as any).error;

    if (errCode === 'user_cancel' || errCode === 'system_cancel' || errCode === 'app_cancel') {
      return { success: false, error: 'Authentication canceled', isCanceled: true };
    }

    if (errCode === 'user_fallback') {
      return { success: false, error: 'Switched to password or OTP', isFallback: true };
    }

    await triggerHaptic('error');

    if (errCode === 'lockout' || errCode === 'lockout_permanent') {
      return {
        success: false,
        error: 'Biometric attempts locked due to multiple failures. Use password/OTP.',
      };
    }

    return {
      success: false,
      error: (result as any).warning || (result as any).message || 'Biometric verification was unsuccessful.',
    };
  } catch (error: any) {
    await triggerHaptic('error');
    return {
      success: false,
      error: error?.message || 'Biometric system error encountered.',
    };
  }
};
