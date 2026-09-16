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
  ScrollView,
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
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'numeric' | 'email-address' | 'phone-pad' | 'numbers-and-punctuation';
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);

  // Calendar navigation state
  const initialDate = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : new Date();
  const [calYear, setCalYear] = useState(initialDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initialDate.getMonth()); // 0-11

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

        <Modal visible={isSelectOpen} transparent animationType="slide" onRequestClose={() => setIsSelectOpen(false)}>
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

  // ─── Interactive Calendar Picker Implementation ───────────────────────────
  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(calMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const fullDateStr = `${calYear}-${formattedMonth}-${formattedDay}`;
    onChangeText(fullDateStr);
    setIsCalendarOpen(false);
    setIsYearPickerOpen(false);
  };

  const renderCalendarModal = () => {
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate(); // 28-31

    const daysArray: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      daysArray.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      daysArray.push(d);
    }

    // Available years: 1940 to 2035 (descending for easy DOB selection)
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 5; y >= 1940; y--) {
      years.push(y);
    }

    return (
      <Modal visible={isCalendarOpen} transparent animationType="fade" onRequestClose={() => setIsCalendarOpen(false)}>
        <View style={styles.calendarOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border }]}>
            {/* Header: Month / Year / Nav */}
            <View style={styles.calNavHeader}>
              <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsYearPickerOpen(!isYearPickerOpen)}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </Text>
                <Ionicons
                  name={isYearPickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.primary}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Quick Year Jump View */}
            {isYearPickerOpen ? (
              <ScrollView style={{ maxHeight: 240, marginVertical: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {years.map((yr) => (
                    <TouchableOpacity
                      key={yr}
                      onPress={() => {
                        setCalYear(yr);
                        setIsYearPickerOpen(false);
                      }}
                      style={[
                        styles.yearItem,
                        {
                          backgroundColor: yr === calYear ? colors.primary : 'transparent',
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: yr === calYear ? '#fff' : colors.text, fontWeight: yr === calYear ? 'bold' : 'normal' }}>
                        {yr}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <>
                {/* Week Day Labels */}
                <View style={styles.weekRow}>
                  {WEEK_DAYS.map((w, idx) => (
                    <Text key={idx} style={[styles.weekLabel, { color: colors.textMuted }]}>
                      {w}
                    </Text>
                  ))}
                </View>

                {/* Day Grid */}
                <View style={styles.daysGrid}>
                  {daysArray.map((day, idx) => {
                    if (day === null) {
                      return <View key={idx} style={styles.dayCell} />;
                    }
                    const dayStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = value === dayStr;

                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleSelectDay(day)}
                        style={[
                          styles.dayCell,
                          isSelected && { backgroundColor: colors.primary, borderRadius: 20 },
                        ]}
                      >
                        <Text
                          style={{
                            color: isSelected ? '#FFFFFF' : colors.text,
                            fontWeight: isSelected ? '700' : '500',
                            fontSize: 14,
                          }}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Bottom Footer Actions */}
            <View style={[styles.calFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  const now = new Date();
                  setCalYear(now.getFullYear());
                  setCalMonth(now.getMonth());
                  handleSelectDay(now.getDate());
                }}
                style={styles.calFooterBtn}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Today</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onChangeText('');
                  setIsCalendarOpen(false);
                }}
                style={styles.calFooterBtn}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '500' }}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsCalendarOpen(false)} style={styles.calFooterBtn}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
          <TouchableOpacity
            onPress={() => !disabled && setIsCalendarOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ padding: 4 }}
          >
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {error ? (
          <Text style={{ color: semanticColor.error.fg, fontSize: 12, marginTop: space.xs }}>{error}</Text>
        ) : null}

        {renderCalendarModal()}
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
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    padding: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  calNavHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calNavBtn: {
    padding: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  yearItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    margin: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  calFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  calFooterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
