import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { storage } from '../utils/storage';
import { syncBiometricSessionTokens } from '../utils/biometrics';
// Mock DB — loaded only when EXPO_PUBLIC_MOCK_API === 'true'
import { handleMockRequest } from './mockDb';

export interface ApiError {
  code: string;
  message: string;
  details: any;
}

// Environment variables — points directly to live AWS Mumbai production backend
const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://karamstay-prod-alb-2085938532.ap-south-1.elb.amazonaws.com/api/v1';
// Mock mode is strictly opt-in: it only turns on when EXPO_PUBLIC_MOCK_API is explicitly
// "true". Every other value (including unset, and any production build) hits the real
// backend at BASE_URL. This is the local-dev fallback only — never shipped on by default.
const USE_MOCK = process.env.EXPO_PUBLIC_MOCK_API === 'true';

// Base Axios instance
export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// A separate instance without polyfills to prevent infinite recursion
const rawClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to set headers on rawClient too
export const syncAuthHeaders = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    rawClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    delete rawClient.defaults.headers.common['Authorization'];
  }
};

// Add request interceptor to insert access token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await storage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh
let isRefreshing = false;
let refreshSubscribers: {
  resolve: (token: string) => void;
  reject: (error: any) => void;
}[] = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((sub) => sub.resolve(token));
  refreshSubscribers = [];
};

const onRefreshFailed = (err: any) => {
  refreshSubscribers.forEach((sub) => sub.reject(err));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (
  resolve: (token: string) => void,
  reject: (error: any) => void
) => {
  refreshSubscribers.push({ resolve, reject });
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (USE_MOCK) return Promise.reject(error); // Skip refresh loops in mock mode

    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    const reqUrl = originalRequest?.url || '';
    const isAuthEndpoint =
      reqUrl.includes('/auth/login') ||
      reqUrl.includes('/auth/refresh') ||
      reqUrl.includes('/auth/otp') ||
      reqUrl.includes('/auth/logout');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber(
            (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(apiClient(originalRequest));
            },
            (err: any) => {
              reject(err);
            }
          );
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await storage.getItem('refresh_token');
        if (!refreshToken) {
          isRefreshing = false;
          onRefreshFailed(error);
          await storage.deleteItem('access_token');
          await storage.deleteItem('refresh_token');
          syncAuthHeaders(null);
          return Promise.reject(error);
        }

        const response = await rawClient.post('/auth/refresh', { refresh_token: refreshToken });
        const { access_token, refresh_token: newRefreshToken } = response.data;

        await storage.setItem('access_token', access_token);
        await storage.setItem('refresh_token', newRefreshToken);
        syncAuthHeaders(access_token);
        await syncBiometricSessionTokens(access_token, newRefreshToken);

        isRefreshing = false;
        onRefreshed(access_token);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailed(refreshError);
        await storage.deleteItem('access_token');
        await storage.deleteItem('refresh_token');
        syncAuthHeaders(null);
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// Helper to normalize backend error responses
export const parseApiError = (error: any): ApiError => {
  if (error?.response) {
    const status = error.response.status;
    const data = error.response.data;

    let message = 'An error occurred';
    if (typeof data?.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data?.detail) && data.detail.length > 0) {
      message = data.detail
        .map((d: any) => {
          const field = Array.isArray(d.loc)
            ? d.loc.filter((l: any) => l !== 'body').join('.')
            : '';
          return field ? `${field}: ${d.msg || JSON.stringify(d)}` : d.msg || JSON.stringify(d);
        })
        .join('; ');
    } else if (typeof data?.message === 'string') {
      message = data.message;
    } else if (typeof data?.error === 'string') {
      message = data.error;
    } else if (error.message) {
      message = error.message;
    }

    return {
      code:
        data?.code ||
        (status === 401
          ? 'UNAUTHORIZED'
          : status === 403
          ? 'FORBIDDEN'
          : status === 404
          ? 'NOT_FOUND'
          : 'HTTP_ERROR'),
      message,
      details: data?.details || data?.detail || null,
    };
  }

  if (error?.request) {
    const detailMsg = error?.message ? ` (${error.message})` : '';
    return {
      code: 'NETWORK_ERROR',
      message: `Unable to connect to server${detailMsg}. Please check your internet connection.`,
      details: null,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'An unexpected error occurred',
    details: null,
  };
};

/**
 * Normalizes any storage or download URL (S3, backend stream, or local dev fallback)
 * into a fully resolvable absolute URL for React Native WebBrowser and Image components.
 */
export const resolveStorageUrl = (url?: string | null): string => {
  if (!url) return '';
  const baseURL = (apiClient.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
  if (url.includes('s3.local.karamstay.internal')) {
    const parts = url.split('s3.local.karamstay.internal/');
    if (parts.length > 1) {
      const pathWithQuery = parts[1];
      const slashIdx = pathWithQuery.indexOf('/');
      const keyAndQuery = slashIdx !== -1 ? pathWithQuery.slice(slashIdx + 1) : pathWithQuery;
      const cleanKey = keyAndQuery.split('?')[0];
      return `${apiClient.defaults.baseURL}/storage/file?key=${encodeURIComponent(cleanKey)}`;
    }
  }
  if (url.startsWith('/')) {
    return `${baseURL}${url}`;
  }
  return url;
};

// Mock mode request interceptor
apiClient.interceptors.request.use((config) => {
  if (USE_MOCK) {
    // In mock mode, intercept all calls and route to the isolated mock router.
    config.adapter = (async (cfg: any) => {
      try {
        const res = await handleMockRequest(cfg);
        return {
          data: res.data,
          status: res.status,
          statusText: 'OK',
          headers: {},
          config: cfg,
        };
      } catch (err: any) {
        throw new AxiosError(err.message, undefined, cfg, undefined, {
          data: { code: 'INTERNAL_ERROR', message: err.message },
          status: 500,
          statusText: 'Internal Error',
          headers: {},
          config: cfg,
        } as any);
      }
    }) as any;
  }
  return config;
});

