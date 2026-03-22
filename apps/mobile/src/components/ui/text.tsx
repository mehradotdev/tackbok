import * as React from 'react';
import { Text as RNText, type Role } from 'react-native';
import { cn, tv, type VariantProps } from 'tailwind-variants';
import * as Slot from '~/components/primitives/slot';

const textVariants = tv({
  base: 'text-foreground text-base text-left',
  variants: {
    variant: {
      default: '',
      h1: 'text-center text-4xl font-extrabold tracking-tight',
      h2: 'text-3xl font-semibold tracking-tight',
      h3: 'text-2xl font-semibold tracking-tight',
      h4: 'text-xl font-semibold tracking-tight',
      p: 'mt-3 leading-7 sm:mt-6',
      blockquote: 'mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6',
      code: 'bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
      lead: 'text-muted-foreground text-xl',
      large: 'text-lg font-semibold',
      small: 'text-sm font-medium leading-tight',
      muted: 'text-muted-foreground text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: undefined,
  code: undefined,
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ref,
  ...props
}: React.ComponentProps<typeof RNText> &
  TextVariantProps & { ref?: React.Ref<RNText> } & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;

  return (
    <Component
      ref={ref}
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };
