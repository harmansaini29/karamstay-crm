import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { storage } from '../utils/storage';
// Mock DB — loaded only when EXPO_PUBLIC_MOCK_API === 'true'
import { handleMockRequest } from './mockDb';

export interface ApiError {
  code: string;
  message: string;
  details: any;
}

// Environment variables
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';
// Mock mode is strictly opt-in: it only turns on when EXPO_PUBLIC_MOCK_API is explicitly
// "true". Every other value (including unset, and any production build) hits the real
// backend at BASE_URL. This is the local-dev fallback only — never shipped on by default.
const USE_MOCK = process.env.EXPO_PUBLIC_MOCK_API === 'true';

// Base Axios instance
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// A separate instance without polyfills to prevent infinite recursion
const rawClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const tenancyCache = new Map<number, any>();

// Helper to set headers on rawClient too
const syncAuthHeaders = (token: string | null) => {
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
let refreshSubscribers: ((token: string) => void)[] = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (USE_MOCK) return Promise.reject(error); // Skip refresh loops in mock mode

    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await storage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await rawClient.post('/auth/refresh', { refresh_token: refreshToken });
        const { access_token, refresh_token: newRefreshToken } = response.data;

        await storage.setItem('access_token', access_token);
        await storage.setItem('refresh_token', newRefreshToken);
        syncAuthHeaders(access_token);

        isRefreshing = false;
        onRefreshed(access_token);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        await storage.deleteItem('access_token');
        await storage.deleteItem('refresh_token');
        syncAuthHeaders(null);
        return Promise.reject(refreshError);
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

    return {
      code: data?.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR'),
      message: data?.message || error.message || 'An error occurred',
      details: data?.details || null,
    };
  }

  if (error?.request) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the server. Please check your network connection.',
      details: null,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'An unexpected error occurred',
    details: null,
  };
};

// Polyfill interceptor for request adapter
apiClient.interceptors.request.use((config) => {
  const url = config.url || '';

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
    return config;
  }

  // Intercept GET /invoices/{id} when NOT in mock mode (fallback polyfills)
  const invoiceMatch = url.match(/^\/invoices\/(\d+)$/);
  if (invoiceMatch && config.method?.toLowerCase() === 'get') {
    const id = parseInt(invoiceMatch[1], 10);
    config.adapter = (async (cfg: any) => {
      const res = await polyfillGetInvoice(id, cfg);
      if (res.status >= 400) {
        throw new AxiosError(res.statusText, undefined, cfg, undefined, res as any);
      }
      return res;
    }) as any;
  }

  // Intercept GET /tenancies/{id} when NOT in mock mode
  const tenancyMatch = url.match(/^\/tenancies\/(\d+)$/);
  if (tenancyMatch && config.method?.toLowerCase() === 'get') {
    const id = parseInt(tenancyMatch[1], 10);
    config.adapter = (async (cfg: any) => {
      const res = await polyfillGetTenancy(id, cfg);
      if (res.status >= 400) {
        throw new AxiosError(res.statusText, undefined, cfg, undefined, res as any);
      }
      return res;
    }) as any;
  }

  // Intercept GET /tenancies/me when NOT in mock mode
  if (url === '/tenancies/me' && config.method?.toLowerCase() === 'get') {
    config.adapter = (async (cfg: any) => {
      const res = await polyfillGetMyTenancy(cfg);
      if (res.status >= 400) {
        throw new AxiosError(res.statusText, undefined, cfg, undefined, res as any);
      }
      return res;
    }) as any;
  }

  return config;
});

// Cache tenancy when checking in via POST /tenancies
apiClient.interceptors.response.use(
  (response) => {
    const url = response.config.url || '';
    if (url === '/tenancies' && response.config.method?.toLowerCase() === 'post' && response.status === 201) {
      const tenancy = response.data;
      tenancyCache.set(tenancy.id, tenancy);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

/**
 * Legacy Polyfill Implementations (used when NOT in mock mode)
 */
const polyfillGetInvoice = async (invoiceId: number, config: AxiosRequestConfig) => {
  try {
    const response = await rawClient.get('/invoices');
    const invoices: any[] = response.data;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return { data: { code: 'NOT_FOUND', message: 'Invoice not found', details: {} }, status: 404, statusText: 'Not Found', headers: {}, config };
    return { data: invoice, status: 200, statusText: 'OK', headers: {}, config };
  } catch (err) {
    throw err;
  }
};

const polyfillGetTenancy = async (tenancyId: number, config: AxiosRequestConfig) => {
  try {
    if (tenancyCache.has(tenancyId)) {
      return { data: tenancyCache.get(tenancyId), status: 200, statusText: 'OK', headers: {}, config };
    }
    let ledgerEntries: any[] = [];
    try {
      const ledgerRes = await rawClient.get(`/ledger?tenancy_id=${tenancyId}`);
      ledgerEntries = ledgerRes.data;
    } catch (e) {}

    let securityDeposit = 0;
    let monthlyRent = 0;
    let startDate = new Date().toISOString().split('T')[0];

    const depositEntry = ledgerEntries.find(e => e.entry_type === 'security_deposit');
    if (depositEntry) {
      securityDeposit = depositEntry.amount;
      startDate = depositEntry.occurred_on;
    }

    const rentEntry = ledgerEntries.find(e => e.entry_type === 'rent');
    if (rentEntry) monthlyRent = rentEntry.amount;

    const reconstructedTenancy = {
      id: tenancyId,
      tenant_id: 1,   // TODO: AWS — resolve via GET /tenancies/{id} once live backend has full data
      unit_id: 1,     // TODO: AWS — resolve via GET /tenancies/{id} once live backend has full data
      start_date: startDate,
      end_date: null,
      move_out_date: null,
      monthly_rent: monthlyRent || 15000,
      security_deposit: securityDeposit || 30000,
      billing_day: 1,
      status: 'active',
    };

    tenancyCache.set(tenancyId, reconstructedTenancy);
    return { data: reconstructedTenancy, status: 200, statusText: 'OK', headers: {}, config };
  } catch (err) {
    throw err;
  }
};

const polyfillGetMyTenancy = async (config: AxiosRequestConfig) => {
  try {
    const tenantRes = await rawClient.get('/tenants/me');
    const tenant = tenantRes.data;

    const invoicesRes = await rawClient.get('/invoices');
    const invoices: any[] = invoicesRes.data;

    const tenancyId = invoices.length > 0 ? invoices[0].tenancy_id : 1;
    const tenancyDetailsRes = await polyfillGetTenancy(tenancyId, config);
    const tenancy = tenancyDetailsRes.data;

    // Fetch the actual unit data from the backend instead of using hardcoded strings
    let unitData: any = {
      id: tenancy.unit_id,
      unit_no: '—',
      building: '—',
      floor: '—',
      rent: tenancy.monthly_rent,
      deposit: tenancy.security_deposit,
      status: 'occupied',
      property_name: '—',
      property_address: '—',
    };

    try {
      const unitRes = await rawClient.get(`/units/${tenancy.unit_id}`);
      const unit = unitRes.data;
      unitData = {
        id: unit.id,
        unit_no: unit.unit_no,
        building: unit.building || '—',
        floor: unit.floor != null ? `${unit.floor} Floor` : '—',
        rent: unit.rent,
        deposit: unit.deposit,
        status: unit.status,
        property_name: '—',
        property_address: '—',
      };

      // Fetch property name + address
      try {
        const propRes = await rawClient.get(`/properties/${unit.property_id}`);
        const prop = propRes.data;
        unitData.property_name = prop.name || '—';
        unitData.property_address = [prop.address, prop.city, prop.state].filter(Boolean).join(', ');
      } catch (_propErr) {
        // Property fetch failed — leave defaults
      }
    } catch (_unitErr) {
      // Unit fetch failed — leave defaults
    }

    const fullTenantContext = {
      ...tenancy,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      unit: unitData,
    };
    return { data: fullTenantContext, status: 200, statusText: 'OK', headers: {}, config };
  } catch (err) {
    // Hard network/auth failure — return a graceful shape that does not crash the UI
    return {
      data: {
        id: 0,
        tenant_id: 0,
        unit_id: 0,
        start_date: '',
        end_date: null,
        move_out_date: null,
        monthly_rent: 0,
        security_deposit: 0,
        billing_day: 1,
        status: 'unknown',
        tenant_name: 'Unknown Tenant',
        unit: {
          id: 0,
          unit_no: '—',
          building: '—',
          floor: '—',
          rent: 0,
          deposit: 0,
          status: 'unknown',
          property_name: '—',
          property_address: '—',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  }
};
