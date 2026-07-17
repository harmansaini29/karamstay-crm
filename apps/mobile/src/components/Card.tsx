import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Flat cards drop the shadow and rely on the hairline border only (Airbnb default). */
  flat?: boolean;
}

// Airbnb card: white surface, ~14px rounding (radius.md), 1px hairline border, and at
// most the system's single soft shadow tier. Depth comes from the hairline + rounding,
// not layered elevation.
export const Card: React.FC<CardProps> = ({ children, style, flat = false }) => {
  const { colors, radius, space, shadows } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: space.lg,
          ...(flat ? {} : shadows.sm),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};
