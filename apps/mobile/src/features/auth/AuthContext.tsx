import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { storage } from '../../utils/storage';
import { apiClient, parseApiError, syncAuthHeaders } from '../../api/client';
import { jwtDecode } from 'jwt-decode';
import {
  checkBiometricSupport,
  isBiometricsEnabled,
  getBiometricSession,
  saveBiometricSession,
  clearBiometricSession,
  promptBiometricAuth,
  BIOMETRIC_STORAGE_KEY_ENABLED,
  BIOMETRIC_STORAGE_KEY_SESSION,
  BiometricSessionData,
} from '../../utils/biometrics';

interface UserProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  is_active: boolean;
  role: {
    id: number;
    name: 'owner' | 'manager' | 'accountant' | 'tenant' | 'staff';
  };
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  role: 'owner' | 'manager' | 'accountant' | 'tenant' | 'staff' | null;
  hasAcceptedConsent: boolean;
  setHasAcceptedConsent: (val: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<string | undefined>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  loginWithBiometrics: () => Promise<{
    success: boolean;
    error?: string;
    isCanceled?: boolean;
    isFallback?: boolean;
  }>;
  logout: (options?: { clearBiometrics?: boolean } | boolean | unknown) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  
  // Expo Go on Android (SDK 53+) removed push notification support
  // We must not even evaluate the module, or it will crash.
  if (Constants.executionEnvironment === 'storeClient') {
    console.warn("Push notifications are not supported in Expo Go. Please use a development build.");
    return null;
  }

  try {
    const Notifications = require('expo-notifications');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return tokenData.data;
  } catch (err) {
    console.warn("Failed to register for push notifications:", err);
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserProfile['role']['name'] | null>(null);
  const [hasAcceptedConsent, setHasAcceptedConsent] = useState(true); // Default true so it doesn't flash

  // Restore token on mount
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const accessToken = await storage.getItem('access_token');
      if (accessToken) {
        // Optimistically set authenticated and role from JWT first
        try {
          const decoded: any = jwtDecode(accessToken);
          if (decoded && decoded.role) {
            setRole(decoded.role);
            setIsAuthenticated(true);
          }
        } catch (jwtErr) {
          // Token might be corrupted
        }

        // Retrieve real profile from backend to hydrate
        syncAuthHeaders(accessToken);
        await fetchProfile();
      }
    } catch (e) {
      // Session restoration failed
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async (): Promise<UserProfile | null> => {
    try {
      const res = await apiClient.get('/auth/me');
      const profile: UserProfile = res.data;
      setUser(profile);
      setRole(profile.role.name);
      setIsAuthenticated(true);
      
      // Fetch consents if role is tenant
      let accepted = true;
      if (profile.role.name === 'tenant') {
        try {
          const consentsRes = await apiClient.get('/consents/me');
          const consents = consentsRes.data || [];
          const primaryConsent = consents.find((c: any) => c.consent_type === 'primary_data');
          accepted = primaryConsent ? primaryConsent.granted : false;
        } catch (consentErr) {
          accepted = false;
        }
      }
      setHasAcceptedConsent(accepted);
      
      // Register device for notifications
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await apiClient.post('/devices', {
            fcm_token: token,
            platform: Platform.OS,
          });
        }
      } catch (err) {
        // Device token registration failed silently in background
      }
      return profile;
    } catch (err) {
      // Profile fetch failed, tokens might be expired/revoked
      await handleLogoutActions();
      return null;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      await storage.deleteItem('access_token');
      await storage.deleteItem('refresh_token');
      syncAuthHeaders(null);
      const response = await apiClient.post('/auth/login', { email: email.trim(), password });
      const { access_token, refresh_token } = response.data;
      
      await storage.setItem('access_token', access_token);
      await storage.setItem('refresh_token', refresh_token);
      syncAuthHeaders(access_token);
      
      const profile = await fetchProfile();
      if (profile) {
        try {
          const support = await checkBiometricSupport();
          const explicitSetting = await storage.getItem(BIOMETRIC_STORAGE_KEY_ENABLED);
          if (support.hasHardware && support.isEnrolled && explicitSetting !== 'false') {
            await saveBiometricSession({
              accessToken: access_token,
              refreshToken: refresh_token,
              userId: profile.id,
              userName: profile.name,
              userRole: profile.role.name,
              userIdentifier: profile.email || profile.phone,
              portalType: 'staff',
            });
          }
        } catch (_bioErr) {}
      }
    } catch (err: any) {
      await handleLogoutActions();
      throw parseApiError(err);
    }
  };

  const requestOtp = async (phone: string): Promise<string | undefined> => {
    try {
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
      const res = await apiClient.post('/auth/otp/request', { phone: cleanPhone });
      return res.data?.dev_otp;
    } catch (err: any) {
      throw parseApiError(err);
    }
  };

  const verifyOtp = async (phone: string, code: string) => {
    try {
      await storage.deleteItem('access_token');
      await storage.deleteItem('refresh_token');
      syncAuthHeaders(null);
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
      const response = await apiClient.post('/auth/otp/verify', { phone: cleanPhone, code: code.trim() });
      const { access_token, refresh_token } = response.data;

      await storage.setItem('access_token', access_token);
      await storage.setItem('refresh_token', refresh_token);
      syncAuthHeaders(access_token);

      const profile = await fetchProfile();
      if (profile) {
        try {
          const support = await checkBiometricSupport();
          const explicitSetting = await storage.getItem(BIOMETRIC_STORAGE_KEY_ENABLED);
          if (support.hasHardware && support.isEnrolled && explicitSetting !== 'false') {
            await saveBiometricSession({
              accessToken: access_token,
              refreshToken: refresh_token,
              userId: profile.id,
              userName: profile.name,
              userRole: profile.role.name,
              userIdentifier: profile.phone,
              portalType: 'tenant',
            });
          }
        } catch (_bioErr) {}
      }
    } catch (err: any) {
      await handleLogoutActions();
      throw parseApiError(err);
    }
  };

  const loginWithBiometrics = async (): Promise<{
    success: boolean;
    error?: string;
    isCanceled?: boolean;
    isFallback?: boolean;
  }> => {
    try {
      const sessionResult = await getBiometricSession();
      if (!sessionResult.isValid || !sessionResult.session) {
        if (sessionResult.isExpired) {
          return {
            success: false,
            error: 'Your 7-day biometric authorization has expired. Please sign in with password or OTP to renew.',
          };
        }
        return {
          success: false,
          error: 'No active biometric session found on this device. Please sign in with password or OTP.',
        };
      }

      // Prompt biometric authentication (Face ID, Touch ID, Fingerprint)
      const promptResult = await promptBiometricAuth(
        `Verify your identity as ${sessionResult.session.userName} to sign in`
      );

      if (!promptResult.success) {
        return {
          success: false,
          error: promptResult.error || 'Biometric authentication was canceled or failed.',
          isCanceled: promptResult.isCanceled,
          isFallback: promptResult.isFallback,
        };
      }

      // Biometrics scan succeeded! Restore tokens and session
      setIsLoading(true);
      const { accessToken, refreshToken, enrolledAt, expiresAt } = sessionResult.session;

      let activeAccessToken = accessToken;
      let activeRefreshToken = refreshToken;
      let profile: UserProfile | null = null;

      try {
        syncAuthHeaders(activeAccessToken);
        const testRes = await apiClient.get('/auth/me');
        profile = testRes.data;
      } catch (_authErr) {
        // Access token might be expired (15m window); refresh via backend
        try {
          const refreshRes = await apiClient.post('/auth/refresh', {
            refresh_token: activeRefreshToken,
          });
          activeAccessToken = refreshRes.data.access_token;
          activeRefreshToken = refreshRes.data.refresh_token;

          await storage.setItem('access_token', activeAccessToken);
          await storage.setItem('refresh_token', activeRefreshToken);
          syncAuthHeaders(activeAccessToken);

          const profileRes = await apiClient.get('/auth/me');
          profile = profileRes.data;
        } catch (_refreshErr) {
          await clearBiometricSession();
          await handleLogoutActions();
          return {
            success: false,
            error: 'Session expired or invalidated. Please sign in with your password or OTP.',
          };
        }
      }

      if (!profile) {
        await clearBiometricSession();
        await handleLogoutActions();
        return {
          success: false,
          error: 'Unable to restore user profile. Please sign in again.',
        };
      }

      setUser(profile);
      setRole(profile.role.name);
      setIsAuthenticated(true);

      // Fetch consents if role is tenant
      let accepted = true;
      if (profile.role.name === 'tenant') {
        try {
          const consentsRes = await apiClient.get('/consents/me');
          const consents = consentsRes.data || [];
          const primaryConsent = consents.find((c: any) => c.consent_type === 'primary_data');
          accepted = primaryConsent ? primaryConsent.granted : false;
        } catch (_consentErr) {
          accepted = false;
        }
      }
      setHasAcceptedConsent(accepted);

      // Register device for notifications
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await apiClient.post('/devices', {
            fcm_token: token,
            platform: Platform.OS,
          });
        }
      } catch (_devErr) {}

      // Preserve active tokens in storage & update biometric session while retaining 7-day validity
      await storage.setItem('access_token', activeAccessToken);
      await storage.setItem('refresh_token', activeRefreshToken);

      const updatedSession: BiometricSessionData = {
        ...sessionResult.session,
        accessToken: activeAccessToken,
        refreshToken: activeRefreshToken,
        enrolledAt,
        expiresAt,
      };
      await storage.setItem(BIOMETRIC_STORAGE_KEY_SESSION, JSON.stringify(updatedSession));

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Biometric login failed. Please try again.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoutActions = async () => {
    try {
      queryClient.clear();
    } catch {}
    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    syncAuthHeaders(null);
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setHasAcceptedConsent(true);
  };

  const logout = async (options?: { clearBiometrics?: boolean } | boolean | unknown) => {
    try {
      const clearBiometrics =
        options === true ||
        (typeof options === 'object' &&
          options !== null &&
          'clearBiometrics' in options &&
          (options as any).clearBiometrics === true);
      const isBioEnabled = await isBiometricsEnabled();
      const refreshToken = await storage.getItem('refresh_token');
      if (clearBiometrics || !isBioEnabled) {
        if (refreshToken) {
          await apiClient.post('/auth/logout', { refresh_token: refreshToken });
        }
        await clearBiometricSession();
      }
    } catch (err) {
      // Silently fail logout API call, proceed with clearing storage
    } finally {
      await handleLogoutActions();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        role,
        hasAcceptedConsent,
        setHasAcceptedConsent,
        login,
        requestOtp,
        verifyOtp,
        loginWithBiometrics,
        logout,
        refreshProfile: async () => {
          await fetchProfile();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
