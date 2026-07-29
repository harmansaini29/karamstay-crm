/**
 * TenantAgreementGate.tsx
 *
 * Intercept on tenant first-login. Queries the tenant's active tenancy, then
 * checks for a pending (unfilled) agreement bound to that tenancy_id.
 *
 * Flow:
 *   1. GET /tenancies/me → resolve active tenancy_id & tenant_id
 *   2. GET /agreements?tenancy_id={id} → find agreement for this tenancy
 *   3a. If agreement.tracker_stage < 1 → replace to TenantAgreementFormScreen
 *   3b. If agreement exists & stage >= 1 → replace to Home (already submitted)
 *   3c. No tenancy / no agreement → replace to Home (new tenant, check-in not done yet)
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';

interface Agreement {
  id: number;
  tenancy_id: number;
  tenant_id: number;
  tracker_stage: number;
  status: string;
}

interface Tenancy {
  id: number;
  tenant_id: number;
  status: string;
}

export const TenantAgreementGate: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font } = useTheme();

  // Step 1: resolve active tenancy
  const { data: tenancy, isLoading: tenancyLoading } = useQuery<Tenancy | null>({
    queryKey: ['tenancies', 'me'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/tenancies/me');
        return res.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });

  // Step 2: resolve agreement for this tenancy
  const { data: agreements = [], isLoading: agLoading } = useQuery<Agreement[]>({
    queryKey: ['agreements', 'tenancy', tenancy?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/agreements?tenancy_id=${tenancy!.id}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!tenancy?.id,
    staleTime: 30_000,
  });

  const isLoading = tenancyLoading || (!!tenancy && agLoading);

  useEffect(() => {
    if (isLoading) return;

    const pending = agreements.find((a) => !a.tracker_stage || a.tracker_stage < 1);

    if (pending) {
      navigation.replace('TenantAgreementFormScreen', { agreementId: pending.id });
    } else {
      navigation.replace('TenantDashboard');
    }
  }, [isLoading, agreements, tenancy]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: font.caption.fontSize }}>
        Loading your profile…
      </Text>
    </View>
  );
};
