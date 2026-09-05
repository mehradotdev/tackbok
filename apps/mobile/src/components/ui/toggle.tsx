import * as React from 'react';
import { cn, tv, type VariantProps } from 'tailwind-variants';
import { Icon } from '~/components/ui/icon';
import { TextClassContext } from '~/components/ui/text';
import * as TogglePrimitive from '~/components/primitives/toggle';

const toggleVariants = tv({
  base: cn(
    'active:bg-muted group flex flex-row items-center justify-center gap-2 rounded-md',
  ),
  variants: {
    variant: {
      default: 'bg-transparent',
      outline: cn(
        'active:bg-accent border border-theme bg-transparent shadow-sm shadow-black/5',
      ),
    },
    size: {
      // No sm: (tablet) overrides — mobile-only app, keep phone density on tablets.
      default: 'h-10 min-w-10 px-2.5',
      sm: 'h-9 min-w-9 px-2',
      xs: 'px-2 py-0.5', // No fixed height, allows content to determine size
      lg: 'h-11 min-w-11 px-3',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

function Toggle({
  className,
  variant,
  size,
  ref,
  ...props
}: TogglePrimitive.RootProps &
  VariantProps<typeof toggleVariants> & { ref?: React.Ref<TogglePrimitive.RootRef> }) {
  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm text-foreground font-body-medium',
        props.pressed && 'text-accent-foreground',
      )}>
      <TogglePrimitive.Root
        ref={ref}
        className={cn(
          toggleVariants({ variant, size }),
          props.disabled && 'opacity-50',
          props.pressed && 'bg-accent',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function ToggleIcon({ className, ...props }: React.ComponentProps<typeof Icon>) {
  const textClass = React.useContext(TextClassContext);
  return <Icon className={cn('size-4 shrink-0', textClass, className)} {...props} />;
}

export { Toggle, ToggleIcon, toggleVariants };
