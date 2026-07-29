/**
 * AgreementTrackerCard.tsx
 *
 * Elevated, Airbnb-token-driven tracker timeline component used in both
 * the Tenant Agreement Form (tenant view) and Agreement Workspace (owner view).
 *
 * Features:
 *  • Rausch #FF385C primary active stage indicator with animated pulsing dot
 *  • Hairline-border step connectors, soft shadow cards
 *  • Real-time status chips per stage with colour-coded semantics
 *  • Pending action callouts: clearly shows what the tenant must do next
 *  • Completion celebration row when all 4 stages are done
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackerStage {
  n: number;
  label: string;
  chip: string;             // short status chip label
  pendingAction?: string;   // what remains for the tenant to do
  icon: string;
}

const STAGES: TrackerStage[] = [
  {
    n: 1,
    label: 'Form Submitted',
    chip: 'Form Completed',
    icon: 'document-text-outline',
  },
  {
    n: 2,
    label: 'Word Agreement Generated & Under Review',
    chip: 'Word Agreement Generated',
    pendingAction: 'Your owner is reviewing the compiled document.',
    icon: 'cloud-download-outline',
  },
  {
    n: 3,
    label: 'Offline Stamp / Notary Verification',
    chip: 'Offline Stamp/Notary Pending',
    pendingAction: 'Physical stamp paper & notary verification in progress. Your owner will upload proof.',
    icon: 'ribbon-outline',
  },
  {
    n: 4,
    label: 'Vault Archived & Active',
    chip: 'Vault Archived & Active',
    icon: 'checkmark-circle-outline',
  },
];

// ─── Pulsing dot for the active stage ────────────────────────────────────────

const PulsingDot: React.FC<{ color: string }> = ({ color }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: color + '30',
        transform: [{ scale: pulse }],
      }}
    />
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface AgreementTrackerCardProps {
  stage: number;      // 0-4
  compact?: boolean;  // renders without card shadow, for embedding inside forms
}

export const AgreementTrackerCard: React.FC<AgreementTrackerCardProps> = ({
  stage,
  compact = false,
}) => {
  const { colors, font, space } = useTheme();
  const isComplete = stage >= 4;

  // Chip colours per completion state
  const chipBg = (n: number) => {
    if (stage >= n) return colors.primary + '14';
    if (stage === n - 1) return '#F59E0B14';   // amber = pending
    return colors.border;
  };
  const chipText = (n: number) => {
    if (stage >= n) return colors.primary;
    if (stage === n - 1) return '#B45309';     // amber text
    return colors.textMuted;
  };
  const chipBorder = (n: number) => {
    if (stage >= n) return colors.primary + '30';
    if (stage === n - 1) return '#F59E0B40';
    return 'transparent';
  };

  const container = compact
    ? {}
    : {
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
        marginBottom: space.md,
      };

  return (
    <View style={container}>
      {!compact && (
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: font.h3.fontSize, marginBottom: 16 }}>
          Agreement Progress
        </Text>
      )}

      {STAGES.map((s, idx) => {
        const done = stage >= s.n;
        const active = stage === s.n - 1;  // one step ahead = this is what's next
        const isCurrent = stage === s.n;   // this stage is currently active

        return (
          <View key={s.n} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
            {/* Step indicator column */}
            <View style={{ alignItems: 'center', width: 32 }}>
              <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center', width: 28, height: 28 }}>
                {isCurrent && !isComplete && <PulsingDot color={colors.primary} />}
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: done ? colors.primary : active ? 'transparent' : colors.border + '60',
                    borderWidth: active ? 2 : 0,
                    borderColor: active ? '#F59E0B' : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons
                    name={(done ? 'checkmark' : s.icon) as any}
                    size={13}
                    color={done ? '#fff' : active ? '#B45309' : colors.textMuted}
                  />
                </View>
              </View>
              {/* Connector line */}
              {idx < STAGES.length - 1 && (
                <View
                  style={{
                    width: 1.5,
                    height: 36,
                    backgroundColor: done ? colors.primary + '60' : colors.border,
                    marginTop: 2,
                  }}
                />
              )}
            </View>

            {/* Stage content */}
            <View style={{ flex: 1, marginLeft: 12, paddingBottom: idx < STAGES.length - 1 ? 8 : 0, marginTop: 2 }}>
              {/* Stage label */}
              <Text
                style={{
                  color: done ? colors.text : active ? '#92400E' : colors.textMuted,
                  fontWeight: done ? '700' : '400',
                  fontSize: font.caption.fontSize,
                  lineHeight: 18,
                }}
              >
                Stage {s.n}: {s.label}
              </Text>

              {/* Status chip */}
              <View
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 20,
                  backgroundColor: chipBg(s.n),
                  borderWidth: 1,
                  borderColor: chipBorder(s.n),
                }}
              >
                <Text style={{ color: chipText(s.n), fontWeight: '700', fontSize: 10 }}>
                  {done
                    ? `✓ ${s.chip}`
                    : active
                    ? `⏳ Pending`
                    : `○ Not Started`}
                </Text>
              </View>

              {/* Pending action callout — only shown on the NEXT pending stage */}
              {active && s.pendingAction && (
                <View
                  style={{
                    marginTop: 6,
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: '#FEF3C7',
                    borderLeftWidth: 3,
                    borderLeftColor: '#F59E0B',
                  }}
                >
                  <Text style={{ color: '#78350F', fontSize: 11, lineHeight: 16 }}>
                    {s.pendingAction}
                  </Text>
                </View>
              )}

              {/* Completion row for stage 4 */}
              {s.n === 4 && done && (
                <View
                  style={{
                    marginTop: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: colors.primary + '10',
                    borderWidth: 1,
                    borderColor: colors.primary + '25',
                  }}
                >
                  <Ionicons name="shield-checkmark" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                    Agreement legally archived in the vault.
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* Progress bar */}
      <View style={{ marginTop: 16, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: stage >= 4 ? '#10B981' : colors.primary,
            width: `${Math.min(Math.round((stage / 4) * 100), 100)}%`,
          }}
        />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'right' }}>
        {Math.min(Math.round((stage / 4) * 100), 100)}% complete
      </Text>
    </View>
  );
};
