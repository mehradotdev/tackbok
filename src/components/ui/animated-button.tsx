import React from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { cn } from '~/lib/utils';
import { Button, type ButtonProps } from '~/components/ui/button';

interface AnimatedButtonProps extends ButtonProps {
  depthClassName?: string;
  containerClassName?: string;
}

export function AnimatedButton({
  className,
  containerClassName,
  depthClassName,
  onPressIn,
  onPressOut,
  children,
  ...props
}: AnimatedButtonProps) {
  const translateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const handlePressIn = (event: any) => {
    translateY.value = withSpring(4, { damping: 50, stiffness: 500 });
    onPressIn?.(event);
  };

  const handlePressOut = (event: any) => {
    translateY.value = withSpring(0, { damping: 50, stiffness: 500 });
    onPressOut?.(event);
  };

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
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          className={cn('active:scale-100 shadow-none border-b-0', className)}>
          {children}
        </Button>
      </Animated.View>
    </View>
  );
}
