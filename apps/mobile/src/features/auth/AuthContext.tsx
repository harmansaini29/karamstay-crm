import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { storage } from '../../utils/storage';
import { apiClient, parseApiError } from '../../api/client';
import { jwtDecode } from 'jwt-decode';

interface UserProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  is_active: boolean;
  role: {
    id: number;
    name: 'owner' | 'manager' | 'accountant' | 'tenant';
  };
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  role: 'owner' | 'manager' | 'accountant' | 'tenant' | null;
  hasAcceptedConsent: boolean;
  setHasAcceptedConsent: (val: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
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
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
        await fetchProfile();
      }
    } catch (e) {
      // Session restoration failed
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await apiClient.get('/auth/me');
      setUser(res.data);
      setRole(res.data.role.name);
      setIsAuthenticated(true);
      
      // Fetch consents if role is tenant
      let accepted = true;
      if (res.data.role.name === 'tenant') {
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
    } catch (err) {
      // Profile fetch failed, tokens might be expired/revoked
      await handleLogoutActions();
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { access_token, refresh_token } = response.data;
      
      await storage.setItem('access_token', access_token);
      await storage.setItem('refresh_token', refresh_token);
      
      await fetchProfile();
    } catch (err: any) {
      throw parseApiError(err);
    }
  };

  const requestOtp = async (phone: string) => {
    try {
      // Endpoint returns success regardless of phone existence
      await apiClient.post('/auth/otp/request', { phone });
    } catch (err: any) {
      throw parseApiError(err);
    }
  };

  const verifyOtp = async (phone: string, code: string) => {
    try {
      const response = await apiClient.post('/auth/otp/verify', { phone, code });
      const { access_token, refresh_token } = response.data;

      await storage.setItem('access_token', access_token);
      await storage.setItem('refresh_token', refresh_token);

      await fetchProfile();
    } catch (err: any) {
      throw parseApiError(err);
    }
  };

  const handleLogoutActions = async () => {
    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setHasAcceptedConsent(true);
  };

  const logout = async () => {
    try {
      const refreshToken = await storage.getItem('refresh_token');
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken });
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
        logout,
        refreshProfile: fetchProfile,
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
