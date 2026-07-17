import React from 'react';
import { Pressable, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { color as semanticColor } from '../theme/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  size?: 'default' | 'compact';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

// Airbnb button system (DESIGN.md): primary = Rausch fill / white / weight 500 / 8px
// radius / 48px, pressed flips to Rausch-active (#e00b41). Secondary = white fill with
// a 1px ink outline. Tertiary = plain ink text. No shadow on buttons.
export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  style,
}) => {
  const { colors, radius, space, font } = useTheme();

  const handlePress = () => {
    if (!loading && !disabled) onPress();
  };

  const resolve = (pressed: boolean) => {
    let bg: string = colors.primary;
    let textCol: string = '#FFFFFF';
    let borderCol: string = 'transparent';
    let borderWidth = 0;

    if (variant === 'primary') {
      bg = pressed ? colors.primaryActive : colors.primary;
    } else if (variant === 'secondary') {
      bg = pressed ? colors.surfaceSoft : colors.surface;
      textCol = colors.text;
      borderCol = colors.text;
      borderWidth = 1;
    } else if (variant === 'tertiary') {
      bg = 'transparent';
      textCol = colors.text;
    } else if (variant === 'destructive') {
      bg = pressed ? semanticColor.error.fg : semanticColor.error.solid;
      textCol = '#FFFFFF';
    }

    if (disabled) {
      if (variant === 'primary') {
        bg = semanticColor.brand[100];
        textCol = '#FFFFFF';
      } else if (variant === 'destructive') {
        bg = semanticColor.error.bg;
        textCol = semanticColor.error.fg;
      } else {
        bg = variant === 'tertiary' ? 'transparent' : colors.surfaceSoft;
        textCol = colors.textMuted;
        borderCol = colors.border;
      }
    }

    return { bg, textCol, borderCol, borderWidth };
  };

  const textStyle = (pressed: boolean): TextStyle => ({
    color: resolve(pressed).textCol,
    fontWeight: '500',
    fontSize: size === 'compact' ? font.caption.fontSize : font.body.fontSize,
  });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => {
        const r = resolve(pressed);
        return {
          backgroundColor: r.bg,
          borderColor: r.borderCol,
          borderWidth: r.borderWidth,
          borderRadius: radius.sm,
          height: size === 'compact' ? 40 : 48,
          paddingHorizontal: space.xl,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
          ...style,
        };
      }}
    >
      {({ pressed }) => (
        <>
          {loading ? (
            <ActivityIndicator
              color={textStyle(pressed).color as string}
              size="small"
              style={{ marginRight: space.sm }}
            />
          ) : null}
          <Text style={textStyle(pressed)}>{label}</Text>
        </>
      )}
    </Pressable>
  );
};
