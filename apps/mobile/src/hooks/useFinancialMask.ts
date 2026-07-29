/**
 * useFinancialMask.ts
 *
 * Returns a formatter that masks financial values with '••••' when the
 * current user's role is 'staff'. Owners, managers, and accountants see
 * real values. Tenants see their own values (unmasked on tenant portal).
 *
 * Usage:
 *   const { maskAmount, maskAmountStr } = useFinancialMask();
 *   <Text>{maskAmount(unit.rent)}</Text>        // → '••••' for staff
 *   <Text>{maskAmountStr('₹15,000')}</Text>    // → '••••' for staff
 */

import { useAuth } from '../features/auth/AuthContext';

export const useFinancialMask = () => {
  const { role } = useAuth();
  const isStaff = role === 'staff';

  /**
   * Format a numeric currency value. Staff see '••••', others see
   * a localized INR string (e.g. '₹15,000').
   */
  const maskAmount = (value: number | null | undefined): string => {
    if (isStaff) return '••••';
    if (value == null) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  /**
   * Mask a pre-formatted string value (e.g. from API).
   * Staff see '••••', others see the original string.
   */
  const maskAmountStr = (value: string | null | undefined): string => {
    if (isStaff) return '••••';
    return value ?? '—';
  };

  return { maskAmount, maskAmountStr, isStaff };
};
