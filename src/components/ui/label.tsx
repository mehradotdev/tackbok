import * as React from 'react';
import { Platform } from 'react-native';
import { cn } from '~/lib/utils';
import * as LabelPrimitive from '~/components/primitives/label';

function Label({
  className,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled,
  ref,
  ...props
}: LabelPrimitive.TextProps & { ref?: React.Ref<LabelPrimitive.TextRef> }) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'flex select-none flex-row items-center gap-2',
        disabled && 'opacity-50',
      )}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}>
      <LabelPrimitive.Text
        ref={ref}
        className={cn(
          'text-foreground text-sm font-medium',
          Platform.select({ web: 'leading-none' }),
          className,
        )}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}

export { Label };
