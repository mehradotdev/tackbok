import React from 'react';
import { cn } from '~/lib/utils';
import * as RadioGroupPrimitive from '~/components/primitives/radio-group';

function RadioGroup({
  className,
  ref,
  ...props
}: RadioGroupPrimitive.RootProps & { ref?: React.Ref<RadioGroupPrimitive.RootRef> }) {
  return (
    <RadioGroupPrimitive.Root className={cn('gap-3', className)} ref={ref} {...props} />
  );
}

function RadioGroupItem({
  className,
  ref,
  ...props
}: RadioGroupPrimitive.ItemProps & { ref?: React.Ref<RadioGroupPrimitive.ItemRef> }) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'border-foreground/80 aspect-square size-4 shrink-0 items-center justify-center rounded-full border shadow-sm shadow-black/5',
        props.disabled && 'opacity-50',
        className,
      )}
      {...props}>
      <RadioGroupPrimitive.Indicator className="bg-foreground/80 size-2 rounded-full" />
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
