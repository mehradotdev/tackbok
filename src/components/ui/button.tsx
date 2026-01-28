import { Pressable } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/utils';
import { TextClassContext } from '~/components/ui/text';

const buttonVariants = cva(
  'group shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none',
  {
    variants: {
      variant: {
        default: 'bg-primary active:bg-primary/90 shadow-sm shadow-black/5',
        destructive: 'bg-destructive active:bg-destructive/90 shadow-sm shadow-black/5',
        outline:
          'border-border bg-background active:bg-accent border shadow-sm shadow-black/5',
        secondary: 'bg-secondary active:bg-secondary/80 shadow-sm shadow-black/5',
        ghost: 'active:bg-accent gap-0',
        link: '',
      },
      size: {
        default: 'h-10 px-4 sm:h-9',
        sm: 'h-9 gap-1.5 rounded-md px-3 sm:h-8',
        lg: 'h-11 rounded-md px-6 sm:h-10',
        icon: 'h-10 w-10 sm:h-9 sm:w-9',
        flex: 'flex-1 h-auto',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const buttonTextVariants = cva('text-foreground text-base font-bold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'group-active:text-accent-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'group-active:text-accent-foreground font-medium',
      link: 'text-primary underline font-medium',
    },
    size: {
      default: '',
      sm: '',
      lg: '',
      icon: '',
      flex: '',
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
