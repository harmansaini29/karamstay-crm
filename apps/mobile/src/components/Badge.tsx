import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { color } from '../theme/tokens';

interface BadgeProps {
  status: string;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({ status, style }) => {
  const { radius, space, font } = useTheme();

  // Normalize status text to lowercase for comparison
  const norm = status.toLowerCase();

  let semantic: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral';

  if (
    norm === 'paid' ||
    norm === 'occupied' ||
    norm === 'completed' ||
    norm === 'closed' ||
    norm === 'active' ||
    norm === 'approved' ||
    norm === 'captured' ||
    norm === 'verified'
  ) {
    semantic = 'success';
  } else if (
    norm === 'pending' ||
    norm === 'partial' ||
    norm === 'open' ||
    norm === 'submitted_pending_verification'
  ) {
    semantic = 'warning';
  } else if (norm === 'overdue' || norm === 'failed' || norm === 'rejected') {
    semantic = 'error';
  } else if (norm === 'in_progress') {
    semantic = 'info';
  } else if (norm === 'vacant' || norm === 'checked_out' || norm === 'created') {
    semantic = 'neutral';
  }

  // Get color configurations
  let bg: string = color.neutral[100];
  let fg: string = color.neutral[600];
  let border: string = color.neutral[200];

  if (semantic === 'success') {
    bg = color.success.bg;
    fg = color.success.fg;
    border = color.success.fg + '20';
  } else if (semantic === 'warning') {
    bg = color.warning.bg;
    fg = color.warning.fg;
    border = color.warning.fg + '20';
  } else if (semantic === 'error') {
    bg = color.error.bg;
    fg = color.error.fg;
    border = color.error.fg + '20';
  } else if (semantic === 'info') {
    bg = color.info.bg;
    fg = color.info.fg;
    border = color.info.fg + '20';
  }

  const badgeStyle: ViewStyle = {
    backgroundColor: bg,
    borderColor: border,
    borderWidth: 1,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 22,
    ...style,
  };

  const textStyle: TextStyle = {
    color: fg,
    fontSize: font.overline.fontSize - 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  };

  // Convert status display text (handle multi-underscore statuses like
  // "submitted_pending_verification").
  const label = status.replace(/_/g, ' ');

  return (
    <View style={badgeStyle}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
};
