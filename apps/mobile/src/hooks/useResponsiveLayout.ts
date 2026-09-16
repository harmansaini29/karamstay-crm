import { useWindowDimensions, DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

/**
 * Hook to provide reactive screen dimensions, tablet detection,
 * and safe bottom padding that prevents any content or buttons
 * from being covered by the floating bottom tab bar or system navigation bar.
 */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Tablet threshold (standard: 768px+)
  const isTablet = width >= 768;
  const isSmallPhone = width < 380;
  const isLandscape = width > height;

  // Safely retrieve tab bar height if called within a bottom tab navigator
  let tabBarHeight = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }

  // Dynamic bottom padding:
  // If inside a tab navigator, ensure content scrolls past tab bar + 28px buffer.
  // If outside a tab navigator, respect the device safe-area bottom inset + 28px buffer.
  const contentBottomPadding = tabBarHeight > 0
    ? tabBarHeight + 28
    : Math.max(insets.bottom, 16) + 28;

  // Responsive layout properties
  const maxContentWidth = isTablet ? 860 : 600;
  const horizontalGutter = isTablet ? 32 : isSmallPhone ? 12 : 16;
  const statTileWidth: DimensionValue = isTablet ? '23.5%' : '48%';
  const quickActionWidth: DimensionValue = isTablet ? '22%' : '23%';

  return {
    width,
    height,
    isTablet,
    isSmallPhone,
    isLandscape,
    insets,
    tabBarHeight,
    contentBottomPadding,
    maxContentWidth,
    horizontalGutter,
    statTileWidth,
    quickActionWidth,
  };
}
