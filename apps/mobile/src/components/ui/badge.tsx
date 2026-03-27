import { View, ViewProps } from 'react-native';
import { cn, tv, type VariantProps } from 'tailwind-variants';
import { TextClassContext } from '~/components/ui/text';
import * as Slot from '~/components/primitives/slot';

const badgeVariants = tv({
  base: cn(
    'border-border group shrink-0 flex-row items-center justify-center',
    'gap-1 overflow-hidden rounded-full border px-2 py-0.5',
  ),
  variants: {
    variant: {
      default: cn('bg-primary border-transparent'),
      secondary: cn('bg-secondary border-transparent'),
      destructive: cn('bg-destructive border-transparent'),
      outline: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const badgeTextVariants = tv({
  base: 'text-xs font-body-medium',
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = ViewProps & {
  ref?: React.Ref<View>;
  asChild?: boolean;
} & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot.View : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { Badge, badgeTextVariants, badgeVariants };
export type { BadgeProps };
