import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { color as semanticColor } from '../theme/tokens';
import { Button } from './Button';
import { Card } from './Card';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ==========================================
// 1. LoadingSkeleton Component
// ==========================================
interface LoadingSkeletonProps {
  variant?: 'list' | 'detail' | 'dashboard';
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ variant = 'list' }) => {
  const { colors, space, radius } = useTheme();

  const shimmer = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  const animatedStyle = { opacity: shimmer };

  if (variant === 'dashboard') {
    return (
      <View style={{ padding: space.lg, flex: 1, backgroundColor: colors.bg }}>
        <Animated.View style={[animatedStyle, { height: 120, backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: space.md }]} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md }}>
          <Animated.View style={[animatedStyle, { flex: 1, height: 90, backgroundColor: colors.surface, borderRadius: radius.md, marginRight: space.sm }]} />
          <Animated.View style={[animatedStyle, { flex: 1, height: 90, backgroundColor: colors.surface, borderRadius: radius.md, marginLeft: space.sm }]} />
        </View>
        <Animated.View style={[animatedStyle, { height: 160, backgroundColor: colors.surface, borderRadius: radius.lg }]} />
      </View>
    );
  }

  if (variant === 'detail') {
    return (
      <View style={{ padding: space.lg, flex: 1, backgroundColor: colors.bg }}>
        <Animated.View style={[animatedStyle, { height: 60, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: space.lg }]} />
        <Animated.View style={[animatedStyle, { height: 30, width: '40%', backgroundColor: colors.surface, borderRadius: radius.sm, marginBottom: space.md }]} />
        <Animated.View style={[animatedStyle, { height: 200, backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: space.lg }]} />
        <Animated.View style={[animatedStyle, { height: 48, backgroundColor: colors.surface, borderRadius: radius.md }]} />
      </View>
    );
  }

  // Default 'list'
  return (
    <View style={{ padding: space.lg, flex: 1, backgroundColor: colors.bg }}>
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} style={{ marginBottom: space.md, padding: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Animated.View style={[animatedStyle, { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.border, marginRight: space.md }]} />
            <View style={{ flex: 1 }}>
              <Animated.View style={[animatedStyle, { height: 16, width: '70%', backgroundColor: colors.border, borderRadius: radius.sm, marginBottom: space.sm }]} />
              <Animated.View style={[animatedStyle, { height: 12, width: '40%', backgroundColor: colors.border, borderRadius: radius.sm }]} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
};

// ==========================================
// 2. ErrorState Component
// ==========================================
interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  const { colors, space, font, radius } = useTheme();

  return (
    <View style={[styles.centered, { backgroundColor: colors.bg, padding: space.xl }]}>
      <View style={[styles.stateIconCircle, { backgroundColor: semanticColor.error.bg, borderColor: semanticColor.error.fg + '20', borderRadius: radius.full }]}>
        <Ionicons name="alert-circle-outline" size={32} color={semanticColor.error.fg} />
      </View>
      <Text style={[styles.title, { color: colors.text, fontSize: font.h3.fontSize, fontFamily: font.h3.fontFamily }]}>Something went wrong</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize, fontFamily: font.body.fontFamily, marginBottom: space.xl }]}>
        {message}
      </Text>
      <Button label="Try Again" onPress={onRetry} variant="primary" style={{ width: 160 }} />
    </View>
  );
};

// ==========================================
// 3. EmptyState Component — Airbnb-grade illustrated variants
// ==========================================
interface EmptyStateProps {
  /** Ionicons icon name — used in 'default' variant only */
  icon?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
  /**
   * 'default'  — icon-circle (original behaviour, fully backward compatible)
   * 'search'   — illustrated gradient banner for empty search results
   * 'invoices' — illustrated gradient banner for empty invoice lists
   * 'tickets'  — illustrated gradient banner for empty maintenance ticket lists
   */
  variant?: 'default' | 'search' | 'invoices' | 'tickets';
}

/** Maps variant → { gradient colours, Ionicons name, accent colour } */
const VARIANT_CONFIG: Record<
  NonNullable<EmptyStateProps['variant']>,
  { colors: [string, string]; icon: string; accent: string }
> = {
  default:  { colors: ['#F7F7F7', '#EBEBEB'], icon: 'folder-open-outline',   accent: '#929292' },
  search:   { colors: ['#FFF1F4', '#FFD1DA'], icon: 'search-outline',        accent: '#FF385C' },
  invoices: { colors: ['#EAF1FF', '#DCE9FF'], icon: 'receipt-outline',       accent: '#428BFF' },
  tickets:  { colors: ['#FFF6E6', '#FFE8BA'], icon: 'construct-outline',     accent: '#F0A020' },
};

/** Simple two-stop gradient using nested Views (no expo-linear-gradient needed) */
const GradientBanner: React.FC<{ top: string; bottom: string; icon: string; accent: string }> = ({
  top,
  bottom,
  icon,
  accent,
}) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <View style={[bannerStyles.outer, { backgroundColor: top }]}>
      <View style={[bannerStyles.inner, { backgroundColor: bottom }]}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <View style={[bannerStyles.iconCircle, { backgroundColor: accent + '18', borderColor: accent + '30' }]}>
            <Ionicons name={icon as any} size={40} color={accent} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'folder-open-outline',
  title,
  body,
  ctaLabel,
  onPress,
  variant = 'default',
}) => {
  const { colors, space, font, radius, shadows } = useTheme();
  const cfg = VARIANT_CONFIG[variant];

  return (
    <View style={[styles.centered, { backgroundColor: colors.bg, padding: space.xl }]}>
      {variant === 'default' ? (
        // Original icon-circle — 100% backward compatible
        <View style={[styles.stateIconCircle, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full, ...shadows.sm }]}>
          <Ionicons name={icon as any} size={32} color={colors.textMuted} />
        </View>
      ) : (
        <GradientBanner top={cfg.colors[0]} bottom={cfg.colors[1]} icon={cfg.icon} accent={cfg.accent} />
      )}

      <Text style={[styles.title, { color: colors.text, fontSize: font.h3.fontSize, fontFamily: font.h3.fontFamily }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize, fontFamily: font.body.fontFamily, marginBottom: space.lg }]}>
        {body}
      </Text>
      {ctaLabel && onPress ? (
        <Button label={ctaLabel} onPress={onPress} variant="secondary" style={{ minWidth: 160 }} />
      ) : null}
    </View>
  );
};

// ==========================================
// 4. Toast Notification
// ==========================================
interface ToastProps {
  message: string;
  visible: boolean;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  type = 'success',
  onDismiss,
}) => {
  const { colors, space, radius, shadows, isDark } = useTheme();
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 20,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();

      const timer = setTimeout(() => {
        hideToast();
      }, 3500);

      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(-100);
    }
  }, [visible]);

  const hideToast = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  let bg = colors.surface;
  let border = colors.border;
  let icon = 'checkmark-circle';
  let iconColor: string = semanticColor.success.solid;

  if (type === 'error') {
    icon = 'close-circle';
    iconColor = semanticColor.error.solid;
  } else if (type === 'info') {
    icon = 'information-circle';
    iconColor = semanticColor.info.solid;
  }

  const activeShadow = isDark
    ? { ...shadows.lg, shadowColor: '#000000', shadowOpacity: 0.3 }
    : shadows.lg;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: radius.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          transform: [{ translateY: slideAnim }],
          ...activeShadow,
        },
      ]}
    >
      <Ionicons name={icon as any} size={22} color={iconColor} style={{ marginRight: space.sm }} />
      <Text style={{ color: colors.text, fontWeight: '600', flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{message}</Text>
      <TouchableOpacity onPress={hideToast} style={{ padding: 4 }}>
        <Ionicons name="close-outline" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  stateIconCircle: {
    width: 68,
    height: 68,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  toastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
  },
});

const bannerStyles = StyleSheet.create({
  outer: {
    width: SCREEN_WIDTH * 0.55,
    height: 140,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '80%',
    height: '80%',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
