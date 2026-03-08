import { useEffect, useState } from 'react';
import { BackHandler, Dimensions, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  /** Whether tapping the backdrop dismisses the sheet (default: true) */
  dismissOnBackdropPress?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Pushes the sheet fully off-screen before the first onLayout measurement. */
const OFFSCREEN_Y = Dimensions.get('window').height;

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
  dismissOnBackdropPress = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const height = useSharedValue(0);

  // Track whether the sheet has ever been opened so we can defer rendering
  // children until the first open. This prevents the flash-on-mount where the
  // sheet content is briefly visible before the close animation takes effect.
  const [hasBeenOpen, setHasBeenOpen] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setHasBeenOpen(true);
  }, [isOpen]);

  // progress: 0 = open, 1 = closed.
  const progress = useDerivedValue(() => withTiming(isOpen ? 0 : 1, { duration }));

  // Keyboard animation — only apply offset while the sheet is visible
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const sheetStyle = useAnimatedStyle(() => ({
    // Before the first onLayout, height is 0 which means translateY would be 0
    // and the sheet would flash at the bottom of the screen. Push it fully
    // off-screen until we know the real height.
    opacity: height.value === 0 ? 0 : 1,
    transform: [
      {
        translateY: height.value === 0 ? OFFSCREEN_Y : progress.value * 2 * height.value,
      },
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

  // Close the sheet when the Android hardware back button is pressed
  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, onClose]);

  // Don't render anything until the sheet has been opened at least once
  if (!hasBeenOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/50">
        <Pressable
          className="flex-1"
          onPress={dismissOnBackdropPress ? onClose : undefined}
        />
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
    </>
  );
}
