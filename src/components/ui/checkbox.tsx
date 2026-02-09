import { Check } from 'lucide-react-native';
import { cn } from '~/lib/utils';
import * as CheckboxPrimitive from '~/components/primitives/checkbox';
import { Icon } from '~/components/ui/icon';

const DEFAULT_HIT_SLOP = 24;

function Checkbox({
  className,
  checkedClassName,
  indicatorClassName,
  iconClassName,
  ...props
}: CheckboxPrimitive.RootProps & { ref?: React.Ref<CheckboxPrimitive.RootRef> } & {
  checkedClassName?: string;
  indicatorClassName?: string;
  iconClassName?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'border-border dark:bg-input/30 size-4 shrink-0 rounded-[4px] border shadow-sm shadow-black/5',
        'overflow-hidden',
        props.checked && cn('border-primary', checkedClassName),
        props.disabled && 'opacity-50',
        className,
      )}
      hitSlop={DEFAULT_HIT_SLOP}
      {...props}>
      <CheckboxPrimitive.Indicator
        className={cn(
          'bg-primary h-full w-full items-center justify-center',
          indicatorClassName,
        )}>
        <Icon
          as={Check}
          size={12}
          strokeWidth={3.5}
          className={cn('text-primary-foreground', iconClassName)}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
