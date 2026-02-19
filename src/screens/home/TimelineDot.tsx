import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { CircleMinus, CirclePlus, Minus, Plus } from 'lucide-react-native';
import { cn } from '~/lib/utils';
import { Icon } from '~/components/ui/icon';

interface TimelineDotProps {
  isExpanded: boolean;
  isToday: boolean;
}

export function TimelineDotAnimated({ isExpanded, isToday }: TimelineDotProps) {
  'use no memo';
  // Determine icons based on state
  const CollapsedIcon = isToday ? Plus : CirclePlus;
  const ExpandedIcon = isToday ? Minus : CircleMinus;

  // Animation values
  const expandProgress = useSharedValue(isExpanded ? 1 : 0);

  useEffect(() => {
    expandProgress.value = withTiming(isExpanded ? 1 : 0, { duration: 300 });
  }, [isExpanded, expandProgress]);

  const collapsedIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(expandProgress.value, [0, 1], [1, 0]),
      transform: [
        {
          rotate: `${interpolate(
            expandProgress.value,
            [0, 1],
            [0, 90],
            Extrapolation.CLAMP,
          )}deg`,
        },
      ],
    };
  });

  const expandedIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(expandProgress.value, [0, 1], [0, 1]),
      transform: [
        {
          rotate: `${interpolate(
            expandProgress.value,
            [0, 1],
            [-90, 0],
            Extrapolation.CLAMP,
          )}deg`,
        },
      ],
    };
  });

  return (
    <Animated.View
      className={cn(
        'bg-background rounded-full items-center justify-center size-5',
        isToday && 'bg-foreground p-0.5',
      )}>
      {/* Collapsed Icon (Plus) */}
      <Animated.View style={[collapsedIconStyle, { position: 'absolute' }]}>
        <Icon
          as={CollapsedIcon}
          className={cn('text-foreground size-5', isToday && 'text-background size-4')}
        />
      </Animated.View>

      {/* Expanded Icon (Minus) */}
      <Animated.View style={[expandedIconStyle, { position: 'absolute' }]}>
        <Icon
          as={ExpandedIcon}
          className={cn('text-foreground size-5', isToday && 'text-background size-4')}
        />
      </Animated.View>
    </Animated.View>
  );
}
