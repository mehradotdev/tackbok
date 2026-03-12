import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/utils';
import { Icon } from '~/components/ui/icon';
import { TextClassContext } from '~/components/ui/text';
import * as TogglePrimitive from '~/components/primitives/toggle';

const toggleVariants = cva(
  cn('active:bg-muted group flex flex-row items-center justify-center gap-2 rounded-md'),
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: cn(
          'border-input active:bg-accent border bg-transparent shadow-sm shadow-black/5',
        ),
      },
      size: {
        default: 'h-10 min-w-10 px-2.5 sm:h-9 sm:min-w-9 sm:px-2',
        sm: 'h-9 min-w-9 px-2 sm:h-8 sm:min-w-8 sm:px-1.5',
        xs: 'px-2 py-0.5', // No fixed height, allows content to determine size
        lg: 'h-11 min-w-11 px-3 sm:h-10 sm:min-w-10 sm:px-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

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
        'text-sm text-foreground font-medium',
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
