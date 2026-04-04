import { cn } from 'tailwind-variants';
import { Icon } from '~/components/ui/icon';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';
import { TextClassContext } from '~/components/ui/text';
import * as SelectPrimitive from '~/components/primitives/select';
import { Check, ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

type Option = SelectPrimitive.Option;

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

function SelectValue({
  className,
  ...props
}: SelectPrimitive.ValueProps & {
  className?: string;
}) {
  const { value } = SelectPrimitive.useRootContext();
  return (
    <SelectPrimitive.Value
      className={cn(
        'text-foreground line-clamp-1 flex flex-row items-center gap-2 text-sm',
        !value && 'text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  children,
  size = 'default',
  triggerIcon,
  ...props
}: SelectPrimitive.TriggerProps & {
  children?: React.ReactNode;
  size?: 'default' | 'sm' | 'flex';
  triggerIcon?: React.ReactNode;
}) {
  const { open } = SelectPrimitive.useRootContext();
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming(open ? 1 : 0);
  }, [open, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <SelectPrimitive.Trigger
      className={cn(
        'border-border bg-background flex h-10 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 shadow-sm shadow-black/5 sm:h-9',
        props.disabled && 'opacity-50',
        size === 'sm' && 'h-8 py-2 sm:py-1.5',
        size === 'flex' && 'h-auto py-0',
        className,
      )}
      {...props}>
      {children}
      <Animated.View style={animatedStyle}>
        {triggerIcon || (
          <Icon
            as={ChevronDown}
            aria-hidden={true}
            strokeWidth={2}
            className="text-foreground size-4"
          />
        )}
      </Animated.View>
    </SelectPrimitive.Trigger>
  );
}

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function SelectContent({
  className,
  children,
  position = 'popper',
  portalHost,
  ...props
}: SelectPrimitive.ContentProps & {
  className?: string;
  portalHost?: string;
}) {
  return (
    <SelectPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <SelectPrimitive.Overlay style={StyleSheet.absoluteFill}>
          <TextClassContext.Provider value="text-popover-foreground">
            <NativeOnlyAnimatedView className="z-50" entering={FadeIn} exiting={FadeOut}>
              <SelectPrimitive.Content
                className={cn(
                  'bg-popover border-border relative z-50 min-w-[8rem] rounded-md border shadow-md shadow-black/5 p-1',
                  className,
                )}
                position={position}
                {...props}>
                <SelectPrimitive.Viewport
                  className={cn('p-1', position === 'popper' && 'w-full')}>
                  {children}
                </SelectPrimitive.Viewport>
              </SelectPrimitive.Content>
            </NativeOnlyAnimatedView>
          </TextClassContext.Provider>
        </SelectPrimitive.Overlay>
      </FullWindowOverlay>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.LabelProps & {
  className?: string;
}) {
  return (
    <SelectPrimitive.Label
      className={cn('text-muted-foreground px-2 py-2 text-xs sm:py-1.5', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  ...props
}: SelectPrimitive.ItemProps & {
  className?: string;
}) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'active:bg-accent/50 group relative flex w-full flex-row items-center gap-2 rounded-sm py-2 pl-2 pr-8 sm:py-1.5',
        props.disabled && 'opacity-50',
        className,
      )}
      {...props}>
      <View className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Icon as={Check} className="text-muted-foreground size-4 shrink-0" />
        </SelectPrimitive.ItemIndicator>
      </View>
      <SelectPrimitive.ItemText className="text-foreground group-active:text-accent-foreground select-none text-sm" />
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.SeparatorProps & {
  className?: string;
}) {
  return (
    <SelectPrimitive.Separator
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

function NativeSelectScrollView({
  className,
  ...props
}: React.ComponentProps<typeof ScrollView>) {
  return <ScrollView className={cn('max-h-52', className)} {...props} />;
}

export {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  type Option,
};
