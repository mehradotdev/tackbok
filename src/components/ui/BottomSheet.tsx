import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Portal } from '~/components/primitives/portal';
import { cn } from '~/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface BottomSheetProps {
  /** Whether the bottom sheet is open */
  isOpen: boolean;
  /** Callback when the sheet is closed */
  onClose: () => void;
  /** Animation duration in milliseconds */
  duration?: number;
  /** Content to render inside the sheet */
  children: React.ReactNode;
  /** Additional className for the sheet container */
  className?: string;
  /** Whether to show the grabber handle */
  showHandle?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

// ============================================================================
// Component
// ============================================================================

export function BottomSheet({
  isOpen,
  onClose,
  duration = 300,
  children,
  className,
  showHandle = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const height = useSharedValue(0);
  const progress = useDerivedValue(() => withTiming(isOpen ? 0 : 1, { duration }));

  // Keyboard animation hook
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * 2 * height.value },
      // Move sheet up when keyboard appears — only while the sheet is
      // visible (progress < 1). When fully closed (progress === 1) the
      // keyboard offset would pull the off-screen sheet back into view.
      { translateY: progress.value < 1 ? keyboardHeight.value : 0 },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    zIndex: isOpen ? 50 : withDelay(duration, withTiming(-1, { duration: 0 })),
  }));

  const handleBackdropPress = () => {
    onClose();
  };

  // Generate a unique ID for this bottom sheet instance
  const portalName = React.useId();

  return (
    <Portal name={`bottom-sheet-${portalName}`}>
      <FullWindowOverlay>
        {/* Backdrop */}
        <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
          <Pressable className="flex-1" onPress={handleBackdropPress} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          onLayout={(e) => {
            height.value = e.nativeEvent.layout.height;
          }}
          style={[sheetStyle, { paddingBottom: Math.max(insets.bottom, 16) }]}
          className={cn(
            'absolute bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-background',
            className,
          )}>
          {showHandle && (
            <View className="items-center py-3">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>
          )}
          {children}
        </Animated.View>
      </FullWindowOverlay>
    </Portal>
  );
}
