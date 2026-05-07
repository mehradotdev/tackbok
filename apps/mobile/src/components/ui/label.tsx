import * as React from 'react';
import { Platform } from 'react-native';
import { cn } from 'tailwind-variants';
import * as LabelPrimitive from '~/components/primitives/label';
import { Text as AppText } from '~/components/ui/text';

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
      <LabelPrimitive.Text asChild>
        <AppText
          ref={ref}
          className={cn(
            'text-foreground text-sm font-body-medium',
            Platform.select({ web: 'leading-none' }),
            className,
          )}
          {...props}
        />
      </LabelPrimitive.Text>
    </LabelPrimitive.Root>
  );
}

export { Label };
