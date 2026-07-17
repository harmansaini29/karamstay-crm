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
import { Button } from './Button';
import { Card } from './Card';
import { Ionicons } from '@expo/vector-icons';

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

import { color as semanticColor } from '../theme/tokens';

// ==========================================
// 2. ErrorState Component
// ==========================================
interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  const { colors, space, font, radius, shadows } = useTheme();

  return (
    <View style={[styles.centered, { backgroundColor: colors.bg, padding: space.xl }]}>
      <View style={[styles.stateIconCircle, { backgroundColor: semanticColor.error.bg, borderColor: semanticColor.error.fg + '20', borderRadius: radius.full }]}>
        <Ionicons name="alert-circle-outline" size={32} color={semanticColor.error.fg} />
      </View>
      <Text style={[styles.title, { color: colors.text, fontSize: font.h3.fontSize }]}>Something went wrong</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize, marginBottom: space.xl }]}>
        {message}
      </Text>
      <Button label="Try Again" onPress={onRetry} variant="primary" style={{ width: 160 }} />
    </View>
  );
};

// ==========================================
// 3. EmptyState Component
// ==========================================
interface EmptyStateProps {
  icon?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'folder-open-outline',
  title,
  body,
  ctaLabel,
  onPress,
}) => {
  const { colors, space, font, radius, shadows } = useTheme();

  return (
    <View style={[styles.centered, { backgroundColor: colors.bg, padding: space.xl }]}>
      <View style={[styles.stateIconCircle, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full, ...shadows.sm }]}>
        <Ionicons name={icon as any} size={32} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: colors.text, fontSize: font.h3.fontSize }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize, marginBottom: space.lg }]}>
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
      <Text style={{ color: colors.text, fontWeight: '600', flex: 1, fontSize: 14 }}>{message}</Text>
      <TouchableOpacity onPress={hideToast} style={{ padding: 4 }}>
        <Ionicons name="close-outline" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
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
