import * as Slot from '~/components/primitives/slot';
import * as React from 'react';
import { Pressable, type GestureResponderEvent } from 'react-native';
import type { RootProps, RootRef } from './types';

const Root = ({
  asChild,
  pressed,
  onPressedChange,
  disabled,
  onPress: onPressProp,
  ref,
  ...props
}: RootProps & { ref?: React.Ref<RootRef> }) => {
  function onPress(ev: GestureResponderEvent) {
    if (disabled) return;
    const newValue = !pressed;
    onPressedChange(newValue);
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={ref}
      aria-disabled={disabled}
      role="checkbox"
      aria-checked={pressed}
      onPress={onPress}
      accessibilityState={{
        checked: pressed,
        disabled,
      }}
      disabled={disabled}
      {...props}
    />
  );
};

Root.displayName = 'RootNativeToggle';

export { Root };
export type { RootProps, RootRef };
