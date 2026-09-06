import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { color as semanticColor } from '../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'numeric' | 'email-address' | 'phone-pad';
  error?: string;
  type?: 'text' | 'select' | 'date';
  options?: { label: string; value: string }[];
  style?: ViewStyle;
  disabled?: boolean;
  autoComplete?: any;
  textContentType?: any;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onFocus?: () => void;
  onBlur?: () => void;
  multiline?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  error,
  type = 'text',
  options = [],
  style,
  disabled = false,
  autoComplete,
  textContentType,
  autoCapitalize,
  onFocus,
  onBlur,
  multiline,
}) => {
  const { colors, radius, space, font } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const containerStyle: ViewStyle = {
    marginBottom: space.md,
    ...style,
  };

  const labelStyle: TextStyle = {
    color: colors.text,
    fontSize: font.caption.fontSize,
    fontWeight: font.bodyStrong.fontWeight as any,
    marginBottom: space.xs,
  };

  // Airbnb text-input: white surface, 1px hairline, 8px radius, ~54px. On focus the
  // border thickens to 2px ink (colors.text) — no glow, no colored ring.
  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderWidth: isFocused ? 2 : 1,
    borderColor: error ? semanticColor.error.solid : isFocused ? colors.text : colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    opacity: disabled ? 0.6 : 1,
  };

  const textInputStyle: TextStyle = {
    flex: 1,
    height: '100%',
    color: colors.text,
    fontSize: font.body.fontSize,
  };

  const renderSelect = () => {
    const selectedOption = options.find((opt) => opt.value === value);
    return (
      <View style={containerStyle}>
        {label ? <Text style={labelStyle}>{label}</Text> : null}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => !disabled && setIsSelectOpen(true)}
          disabled={disabled}
          style={[inputContainerStyle, { justifyContent: 'space-between' }]}
        >
          <Text style={{ color: value ? colors.text : colors.textMuted, fontSize: font.body.fontSize }}>
            {selectedOption ? selectedOption.label : placeholder || 'Select option'}
          </Text>
          <Ionicons name="chevron-down-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        {error ? (
          <Text style={{ color: semanticColor.error.fg, fontSize: 12, marginTop: space.xs }}>{error}</Text>
        ) : null}

        <Modal visible={isSelectOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
              {/* Drag Indicator Handle */}
              <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
              
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>{label}</Text>
                <TouchableOpacity onPress={() => setIsSelectOpen(false)} style={styles.closeBtn}>
                  <Ionicons name="close-outline" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                contentContainerStyle={{ paddingBottom: space.xl }}
                renderItem={({ item }) => {
                  const isSelected = item.value === value;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.optionItem,
                        {
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected ? colors.primary + '08' : 'transparent',
                        },
                      ]}
                      onPress={() => {
                        onChangeText(item.value);
                        setIsSelectOpen(false);
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.primary : colors.text,
                          fontSize: font.body.fontSize,
                          fontWeight: isSelected ? '700' : '500',
                          flex: 1,
                        }}
                      >
                        {item.label}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderDate = () => {
    return (
      <View style={containerStyle}>
        {label ? <Text style={labelStyle}>{label}</Text> : null}
        <View style={inputContainerStyle}>
          <TextInput
            style={textInputStyle}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder || 'YYYY-MM-DD'}
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={!disabled}
          />
          <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
        </View>
        {error ? (
          <Text style={{ color: semanticColor.error.fg, fontSize: 12, marginTop: space.xs }}>{error}</Text>
        ) : null}
      </View>
    );
  };

  if (type === 'select') {
    return renderSelect();
  }

  if (type === 'date') {
    return renderDate();
  }

  return (
    <View style={containerStyle}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      <View style={inputContainerStyle}>
        <TextInput
          style={textInputStyle}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          editable={!disabled}
          autoComplete={autoComplete}
          textContentType={textContentType}
        />
      </View>
      {error ? (
        <Text style={{ color: semanticColor.error.fg, fontSize: 12, marginTop: space.xs }}>{error}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 16, 14, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '60%',
    paddingBottom: 24,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 2,
  },
  optionItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
