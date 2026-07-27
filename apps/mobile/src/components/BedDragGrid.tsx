/**
 * BedDragGrid.tsx
 * Production-grade gesture-driven bed grid for multi-bed units.
 *
 * Interaction model
 * -----------------
 *  • Single tap → toggles selection (backward-compatible with existing behaviour)
 *  • Long-press (400 ms) → activates drag mode on that cell:
 *      - The cell lifts with a scale + shadow animation
 *      - User drags across the grid; hovered vacant cells highlight in Rausch
 *      - Releasing over another vacant cell fires onMerge([fromId, toId])
 *      - Releasing over an occupied cell or outside any cell → deactivates drag silently
 *
 * Architecture
 * ------------
 *  Uses React Native's built-in PanResponder + Animated — zero new native modules.
 *  Each cell measures its layout via onLayout so we can do hit-testing during drag.
 *  The grid is rendered in a fixed-column layout (2 columns, 48% width each).
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
  LayoutRectangle,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './Badge';

export interface BedItem {
  id: number;
  bed_no: string;
  status: 'vacant' | 'occupied' | string;
}

interface BedDragGridProps {
  beds: BedItem[];
  selectedBeds: number[];
  /** Called when user taps a vacant bed (single-tap selection toggle) */
  onToggle: (bedId: number) => void;
  /** Called when user drag-drops onto another vacant bed: merges both */
  onMerge: (bedIds: number[]) => void;
  /** Called when user taps an occupied bed (to view resident tenant info) */
  onOccupiedTap?: (bedId: number) => void;
  /** Overall container style */
  style?: ViewStyle;
}

/** How long (ms) the user must hold before drag mode activates */
const LONG_PRESS_DELAY = 400;

export const BedDragGrid: React.FC<BedDragGridProps> = ({
  beds,
  selectedBeds,
  onToggle,
  onMerge,
  onOccupiedTap,
  style,
}) => {
  const { colors, font, radius, space } = useTheme();

  // -------------------------------------------------------------------------
  // Layout registry — populated by each cell's onLayout callback
  // -------------------------------------------------------------------------
  const cellLayouts = useRef<Map<number, LayoutRectangle>>(new Map());

  // -------------------------------------------------------------------------
  // Drag state
  // -------------------------------------------------------------------------
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Animated values for the dragged cell
  const dragScale = useRef(new Animated.Value(1)).current;
  const dragOpacity = useRef(new Animated.Value(1)).current;

  // Pulse animation for hovered target
  const hoverPulse = useRef(new Animated.Value(1)).current;

  const startHoverPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(hoverPulse, { toValue: 1.04, duration: 300, useNativeDriver: true }),
        Animated.timing(hoverPulse, { toValue: 1.0,  duration: 300, useNativeDriver: true }),
      ])
    ).start();
  }, [hoverPulse]);

  const stopHoverPulse = useCallback(() => {
    hoverPulse.stopAnimation();
    hoverPulse.setValue(1);
  }, [hoverPulse]);

  // -------------------------------------------------------------------------
  // Hit-test: given page-relative (x, y) find which bed cell contains it
  // -------------------------------------------------------------------------
  const hitTestBed = (pageX: number, pageY: number): number | null => {
    for (const [bedId, rect] of cellLayouts.current) {
      if (
        pageX >= rect.x &&
        pageX <= rect.x + rect.width &&
        pageY >= rect.y &&
        pageY <= rect.y + rect.height
      ) {
        return bedId;
      }
    }
    return null;
  };

  // -------------------------------------------------------------------------
  // Build PanResponder for a given bed
  // -------------------------------------------------------------------------
  const buildPanResponder = (bed: BedItem) => {
    if (bed.status !== 'vacant') {
      // Occupied beds are tappable (to show tenant info) but not draggable.
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: () => {
          if (onOccupiedTap) onOccupiedTap(bed.id);
        },
      });
    }

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let isDragging = false;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => isDragging,

      onPanResponderGrant: (evt) => {
        // Start long-press timer
        longPressTimer = setTimeout(() => {
          isDragging = true;
          setDraggingId(bed.id);
          // Lift animation
          Animated.parallel([
            Animated.spring(dragScale, { toValue: 1.1, useNativeDriver: true, speed: 30 }),
            Animated.timing(dragOpacity, { toValue: 0.85, duration: 150, useNativeDriver: true }),
          ]).start();
        }, LONG_PRESS_DELAY);
      },

      onPanResponderMove: (evt, gestureState) => {
        if (!isDragging) return;

        const { moveX, moveY } = gestureState;
        const targetId = hitTestBed(moveX, moveY);

        if (
          targetId !== null &&
          targetId !== bed.id &&
          beds.find((b) => b.id === targetId)?.status === 'vacant'
        ) {
          if (hoveredId !== targetId) {
            setHoveredId(targetId);
            stopHoverPulse();
            startHoverPulse();
          }
        } else {
          if (hoveredId !== null) {
            stopHoverPulse();
            setHoveredId(null);
          }
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        if (!isDragging) {
          // Was a tap — toggle selection
          onToggle(bed.id);
          return;
        }

        // Evaluate drop target
        const { moveX, moveY } = gestureState;
        const targetId = hitTestBed(moveX, moveY);
        const targetBed = beds.find((b) => b.id === targetId);

        if (
          targetId !== null &&
          targetId !== bed.id &&
          targetBed?.status === 'vacant'
        ) {
          // Successful merge
          onMerge([bed.id, targetId]);
        }

        // Reset everything
        isDragging = false;
        stopHoverPulse();
        setDraggingId(null);
        setHoveredId(null);
        Animated.parallel([
          Animated.spring(dragScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
          Animated.timing(dragOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      },

      onPanResponderTerminate: () => {
        if (longPressTimer) clearTimeout(longPressTimer);
        isDragging = false;
        stopHoverPulse();
        setDraggingId(null);
        setHoveredId(null);
        Animated.parallel([
          Animated.spring(dragScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
          Animated.timing(dragOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      },
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={[gridStyles.container, style]}>
      {beds.map((bed) => {
        const isSelected = selectedBeds.includes(bed.id);
        const isVacant = bed.status === 'vacant';
        const isDragged = draggingId === bed.id;
        const isHovered = hoveredId === bed.id;

        // Border / background logic
        const borderColor = isHovered
          ? colors.primary
          : isSelected
          ? colors.primary
          : colors.border;

        const bg = isHovered
          ? colors.primary + '18'
          : isSelected
          ? colors.primary + '08'
          : colors.surface;

        const panResponder = buildPanResponder(bed);

        return (
          <Animated.View
            key={bed.id}
            style={[
              gridStyles.cell,
              {
                borderColor,
                backgroundColor: bg,
                borderRadius: radius.md,
                opacity: isDragged ? dragOpacity : isVacant ? 1 : 0.7,
                transform: isDragged ? [{ scale: dragScale }] : isHovered ? [{ scale: hoverPulse }] : [{ scale: 1 }],
                // iOS shadow for dragged cell
                ...(isDragged
                  ? {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.18,
                      shadowRadius: 12,
                      elevation: 8,
                    }
                  : {}),
              },
            ]}
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              cellLayouts.current.set(bed.id, { x, y, width, height });
            }}
            {...panResponder.panHandlers}
          >
            <View style={gridStyles.cellHeader}>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '700',
                  fontSize: font.caption.fontSize,
                  fontFamily: font.caption.fontFamily,
                }}
              >
                {bed.bed_no}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              )}
              {isHovered && !isSelected && (
                <Ionicons name="link-outline" size={16} color={colors.primary} />
              )}
            </View>

            <Badge status={bed.status as any} style={{ marginTop: 8 }} />

            {isVacant ? (
              <Text
                style={{
                  fontSize: 9,
                  color: colors.textMuted,
                  marginTop: 4,
                  fontFamily: font.caption.fontFamily,
                }}
              >
                {draggingId && draggingId !== bed.id
                  ? 'Drop here to merge'
                  : 'Hold & drag to merge'}
              </Text>
            ) : (
              <Text
                style={{
                  fontSize: 9,
                  color: colors.textMuted,
                  marginTop: 4,
                  fontFamily: font.caption.fontFamily,
                }}
              >
                Tap to view tenant
              </Text>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
};

const gridStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cell: {
    width: '48%',
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
