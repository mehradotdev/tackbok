import * as React from 'react';
import { Platform } from 'react-native';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/utils';
import { Icon } from '~/components/ui/icon';
import { TextClassContext } from '~/components/ui/text';
import { toggleVariants } from '~/components/ui/toggle';
import * as ToggleGroupPrimitive from '~/components/primitives/toggle-group';

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
  layout?: 'connected' | 'pills';
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

function ToggleGroup({
  className,
  variant,
  size,
  layout = 'connected',
  children,
  ref,
  ...props
}: ToggleGroupPrimitive.RootProps &
  VariantProps<typeof toggleVariants> & {
    ref?: React.Ref<ToggleGroupPrimitive.RootRef>;
    layout?: 'connected' | 'pills';
  }) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn(
        'flex flex-row items-center shadow-none',
        layout === 'connected' && 'rounded-md',
        layout === 'pills' && 'gap-2 flex-wrap',
        Platform.select({ web: 'w-fit' }),
        variant === 'outline' && layout === 'connected' && 'shadow-sm shadow-black/5',
        className,
      )}
      {...props}>
      <ToggleGroupContext.Provider value={{ variant, size, layout }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function useToggleGroupContext() {
  const context = React.useContext(ToggleGroupContext);
  if (context === null) {
    throw new Error(
      'ToggleGroup compound components cannot be rendered outside the ToggleGroup component',
    );
  }
  return context;
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  isFirst,
  isLast,
  ref,
  ...props
}: ToggleGroupPrimitive.ItemProps &
  VariantProps<typeof toggleVariants> & {
    ref?: React.Ref<ToggleGroupPrimitive.ItemRef>;
  } & {
    isFirst?: boolean;
    isLast?: boolean;
  }) {
  const context = useToggleGroupContext();
  const { value } = ToggleGroupPrimitive.useRootContext();
  const isPills = context.layout === 'pills';
  const isSelected = ToggleGroupPrimitive.utils.getIsSelected(value, props.value);

  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm font-medium',
        isSelected
          ? 'text-accent-foreground'
          : Platform.select({
              web: 'group-hover:text-muted-foreground',
              default: 'text-foreground',
            }),
      )}>
      <ToggleGroupPrimitive.Item
        ref={ref}
        className={cn(
          toggleVariants({
            variant: context.variant || variant,
            size: context.size || size,
          }),
          props.disabled && 'opacity-50',
          // Pills layout: fully rounded, separate items
          isPills && 'rounded-full',
          isPills && isSelected && 'bg-accent',
          // Connected layout: shared borders, rounded only at edges
          !isPills && 'min-w-0 shrink-0 rounded-none shadow-none',
          !isPills && isFirst && 'rounded-l-md',
          !isPills && isLast && 'rounded-r-md',
          !isPills && isSelected && 'bg-accent',
          !isPills &&
            (context.variant === 'outline' || variant === 'outline') &&
            'border-l-0',
          !isPills &&
            (context.variant === 'outline' || variant === 'outline') &&
            isFirst &&
            'border-l',
          Platform.select({
            web: !isPills && 'flex-1 focus:z-10 focus-visible:z-10',
          }),
          className,
        )}
        {...props}>
        {children}
      </ToggleGroupPrimitive.Item>
    </TextClassContext.Provider>
  );
}

function ToggleGroupIcon({ className, ...props }: React.ComponentProps<typeof Icon>) {
  const textClass = React.useContext(TextClassContext);
  return <Icon className={cn('size-4 shrink-0', textClass, className)} {...props} />;
}

export { ToggleGroup, ToggleGroupIcon, ToggleGroupItem };
