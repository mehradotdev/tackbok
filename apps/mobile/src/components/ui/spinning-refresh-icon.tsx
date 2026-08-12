import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from './icon';

interface SpinningRefreshIconProps {
  className?: string;
}

/** Refresh icon that follows the system's reduced-motion preference. */
export function SpinningRefreshIcon({
  className = 'text-foreground size-5',
}: SpinningRefreshIconProps) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );

    return () => cancelAnimation(rotation);
  }, [reducedMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Icon as={RefreshCw} className={className} />
    </Animated.View>
  );
}
