import React, { useCallback, useImperativeHandle } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { cn } from 'tailwind-variants';
import { Button, type ButtonProps } from '~/components/ui/button';

export interface AnimatedButtonHandle {
  simulatePress: () => void;
}

export interface AnimatedButtonProps extends Omit<ButtonProps, 'ref'> {
  depthClassName?: string;
  containerClassName?: string;
  /** Ref to receive a handle with simulatePress() */
  ref?: React.Ref<AnimatedButtonHandle>;
}

export function AnimatedButton({
  className,
  containerClassName,
  depthClassName,
  onPressIn,
  onPressOut,
  onPress,
  ref,
  children,
  ...props
}: AnimatedButtonProps) {
  'use no memo';
  const translateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const handlePressIn = (event: GestureResponderEvent) => {
    translateY.value = withSpring(4, { damping: 50, stiffness: 500 });
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    translateY.value = withSpring(0, { damping: 50, stiffness: 500 });
    onPressOut?.(event);
  };

  const simulatePress = useCallback(() => {
    translateY.value = withSequence(
      withTiming(4, { duration: 250 }),
      withTiming(0, { duration: 250 }),
    );
    onPress?.(null as unknown as GestureResponderEvent);
  }, [onPress, translateY]);

  useImperativeHandle(ref, () => ({
    simulatePress
  }), [simulatePress]);

  return (
    <View className={cn('relative', containerClassName)}>
      {/* Depth/Shadow Layer */}
      <View
        className={cn(
          'absolute inset-x-0 h-full top-[4px] bg-muted-foreground rounded-full',
          depthClassName,
        )}
      />

      <Animated.View style={animatedStyle}>
        <Button
          {...props}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          className={cn('active:scale-100 shadow-none border-b-0', className)}>
          {children}
        </Button>
      </Animated.View>
    </View>
  );
}
