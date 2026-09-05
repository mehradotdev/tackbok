import { Pressable } from 'react-native';
import { cn, tv, type VariantProps } from 'tailwind-variants';
import { TextClassContext } from '~/components/ui/text';

const buttonVariants = tv({
  base: 'group shrink-0 flex-row items-center justify-center gap-2 rounded-md border-theme border-transparent shadow-none active:shadow-none active:translate-y-0.5 active:scale-95',
  variants: {
    variant: {
      default: 'bg-foreground shadow-theme active:opacity-80',
      primary: 'bg-primary shadow-theme active:opacity-90',
      destructive: 'bg-destructive shadow-theme active:opacity-90',
      outline: 'border-theme bg-transparent shadow-theme active:bg-active-overlay',
      secondary: 'bg-secondary shadow-theme active:opacity-80',
      ghost: 'gap-0 active:bg-active-overlay',
      link: 'active:opacity-80',
    },
    size: {
      // NOTE: no sm: (tablet) size overrides here. This app is mobile-only
      // and buttons must keep phone density on tablets — a responsive fixed
      // height (e.g. sm:h-9) silently wins over call-site h-auto in
      // tailwind-merge (different specificity groups) and clips multi-line
      // content on iPad. Call-site h-auto works fine; size="none" remains
      // for full manual control.
      default: 'h-10 px-4',
      sm: 'h-9 gap-1.5 rounded-md px-3',
      lg: 'h-11 rounded-md px-6',
      icon: 'h-10 w-10',
      flex: 'h-auto',
      none: 'p-0 h-auto w-auto',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

const buttonTextVariants = tv({
  base: 'text-foreground text-base font-body-bold',
  variants: {
    variant: {
      default: 'text-background',
      primary: 'text-primary-foreground',
      destructive: 'text-destructive-foreground tracking-wider',
      outline: 'group-active:text-accent-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'group-active:text-accent-foreground font-body-medium',
      link: 'text-primary underline font-body-medium',
    },
    size: {
      default: '',
      sm: '',
      lg: '',
      icon: '',
      flex: '',
      none: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    ref?: React.Ref<React.ComponentRef<typeof Pressable>>;
  };

function Button({ className, variant, size, ref, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        ref={ref}
        className={cn(
          props.disabled && 'opacity-50',
          buttonVariants({ variant, size }),
          className,
        )}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
