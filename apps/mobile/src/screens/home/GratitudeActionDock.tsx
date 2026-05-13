import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { Calendar, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { Icon } from '~/components/ui/icon';
import { useTranslation } from '~/lib/i18n';
import { Button } from '~/components/ui/button';
import { useGratitudeActionDockDrag } from '~/hooks/useGratitudeActionDockDrag';

export const GRATITUDE_ACTION_DOCK_CONFIG = {
  dimensions: {
    actionSize: 52,
    panelHeight: 148,
    tabWidth: 28,
    expandedWidth: 102,
    cornerRadius: 28,
  },
  gesture: {
    verticalPadding: 16,
    longPressDurationMs: 350,
    expandedProgressThreshold: 0.1,
  },
  animation: {
    spring: {
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    },
    snapSpring: {
      damping: 22,
      stiffness: 280,
      mass: 0.6,
    },
    // Horizontal offset applied while the dock is detached during drag.
    inwardFloatOffsetX: 14,
    // Temporary scale bump while the user is actively dragging.
    dragActiveScale: 1.08,
    // Small shell nudge that keeps the expanded state feeling anchored to the edge.
    expandedShellShiftX: 2,
    // Entry offset for the action buttons as they slide into view.
    actionsEntranceShiftX: 12,
    // Travel distance for the chevron as the dock toggles.
    chevronShiftX: 6,
  },
  icon: {
    strokeWidth: 2.6,
  },
} as const;

export type GratitudeActionDockConfig = typeof GRATITUDE_ACTION_DOCK_CONFIG;

// ─── Sub-components ─────────────────────────────────────────────────
interface DockActionButtonProps {
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}

function DockActionButton({
  accessibilityLabel,
  disabled,
  onPress,
  children,
}: DockActionButtonProps) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={cn(
        'items-center justify-center rounded-full border border-border bg-background',
        'active:opacity-80 shadow-theme',
      )}
      style={{
        width: GRATITUDE_ACTION_DOCK_CONFIG.dimensions.actionSize,
        height: GRATITUDE_ACTION_DOCK_CONFIG.dimensions.actionSize,
      }}>
      {children}
    </Button>
  );
}

// ─── Main component ─────────────────────────────────────────────────
interface GratitudeActionDockProps {
  isExpanded: boolean;
  onToggle: () => void;
  onAddEntry: () => void;
  onPickDate: () => void;
}

/**
 * Right-docked journal action launcher for the home timeline.
 *
 * Supports drag-to-reposition: long-press the collapsed dock to detach it
 * from the right edge, drag vertically, and release to snap back.
 * The vertical position persists across restarts via the settings store.
 */
export function GratitudeActionDock({
  isExpanded,
  onToggle,
  onAddEntry,
  onPickDate,
}: GratitudeActionDockProps) {
  const { t, isRTL } = useTranslation();
  const {
    containerStyle,
    onContainerLayout,
    panGesture,
    progress,
    shellShadowStyle,
    wrapperStyle,
  } = useGratitudeActionDockDrag({
      dockConfig: GRATITUDE_ACTION_DOCK_CONFIG,
      isExpanded,
      isRTL,
      onToggle,
    });
  const directionMultiplier = isRTL ? -1 : 1;
  const collapsedChevronIcon = isRTL ? ChevronRight : ChevronLeft;
  const expandedChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  // ── Animated styles ─────────────────────────────────────────────
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [
            GRATITUDE_ACTION_DOCK_CONFIG.animation.actionsEntranceShiftX *
              directionMultiplier,
            0,
          ],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const collapsedChevronStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 0.45], [1, 1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [
            0,
            -GRATITUDE_ACTION_DOCK_CONFIG.animation.chevronShiftX * directionMultiplier,
          ],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const expandedChevronStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 0.7, 1], [0, 0.8, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [GRATITUDE_ACTION_DOCK_CONFIG.animation.chevronShiftX * directionMultiplier, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const toggleAccessibilityLabel = isExpanded
    ? t('Collapse gratitude actions')
    : t('Expand gratitude actions');

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-0"
      onLayout={onContainerLayout}>
      <Animated.View
        style={wrapperStyle}
        className={cn('absolute z-10', 'right-0 items-end')}>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={shellShadowStyle}
            className="shadow-theme">
            <Animated.View
              style={containerStyle}
              className={cn(
                'flex-row items-center overflow-hidden border border-border bg-muted',
              )}>
              {/* Action buttons – absolutely positioned so they never push
                  the toggle tab out of the collapsed container */}
              <Animated.View
                pointerEvents={isExpanded ? 'auto' : 'none'}
                style={[
                  actionsStyle,
                  {
                    width:
                      GRATITUDE_ACTION_DOCK_CONFIG.dimensions.expandedWidth -
                      GRATITUDE_ACTION_DOCK_CONFIG.dimensions.tabWidth,
                  },
                ]}
                className={cn(
                  'absolute top-0 bottom-0 items-center justify-center gap-3 px-3',
                  'left-0',
                )}>
                <DockActionButton
                  accessibilityLabel={t('Write now')}
                  disabled={!isExpanded}
                  onPress={onAddEntry}>
                  <View className="size-10 items-center justify-center rounded-full">
                    <Icon as={Plus} className="text-primary-foreground" />
                  </View>
                </DockActionButton>

                <DockActionButton
                  accessibilityLabel={t('Pick a date')}
                  disabled={!isExpanded}
                  onPress={onPickDate}>
                  <View className="size-10 items-center justify-center rounded-full">
                    <Icon as={Calendar} className="text-primary-foreground" />
                  </View>
                </DockActionButton>
              </Animated.View>

              {/* Toggle chevron stays pinned to the docked edge in both LTR and RTL. */}
              <Pressable
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityLabel={toggleAccessibilityLabel}
                style={{ width: GRATITUDE_ACTION_DOCK_CONFIG.dimensions.tabWidth }}
                className={cn(
                  'relative h-full items-center justify-center bg-primary active:opacity-80',
                  'ml-auto border-l border-border/70',
                )}>
                <Animated.View
                  style={collapsedChevronStyle}
                  className="absolute inset-0 items-center justify-center">
                  <Icon
                    as={collapsedChevronIcon}
                    className="text-foreground size-5"
                    strokeWidth={GRATITUDE_ACTION_DOCK_CONFIG.icon.strokeWidth}
                  />
                </Animated.View>
                <Animated.View
                  style={expandedChevronStyle}
                  className="absolute inset-0 items-center justify-center">
                  <Icon
                    as={expandedChevronIcon}
                    className="text-foreground size-5"
                    strokeWidth={GRATITUDE_ACTION_DOCK_CONFIG.icon.strokeWidth}
                  />
                </Animated.View>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}
