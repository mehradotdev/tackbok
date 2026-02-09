import * as React from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import {
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewStyle,
  ScrollView,
} from 'react-native';
import { FadeIn } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { cn } from '~/lib/utils';
import { Icon } from '~/components/ui/icon';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';
import { TextClassContext } from '~/components/ui/text';
import * as DropdownMenuPrimitive from '~/components/primitives/dropdown-menu';

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  iconClassName,
  ref,
  ...props
}: DropdownMenuPrimitive.SubTriggerProps & {
  ref?: React.Ref<DropdownMenuPrimitive.SubTriggerRef>;
} & {
  children?: React.ReactNode;
  iconClassName?: string;
  inset?: boolean;
}) {
  const { open } = DropdownMenuPrimitive.useSubContext();
  const icon = Platform.OS === 'web' ? ChevronRight : open ? ChevronUp : ChevronDown;
  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm select-none group-active:text-accent-foreground',
        open && 'text-accent-foreground',
      )}>
      <DropdownMenuPrimitive.SubTrigger
        ref={ref}
        className={cn(
          'active:bg-accent group flex flex-row items-center justify-between rounded-sm px-2 py-2 sm:py-1.5',
          Platform.select({
            web: 'focus:bg-accent focus:text-accent-foreground cursor-default outline-none [&_svg]:pointer-events-none',
          }),
          open && 'bg-accent',
          inset && 'pl-8',
        )}
        {...props}>
        <>{children}</>
        <Icon
          as={icon}
          className={cn('text-foreground size-4 shrink-0', iconClassName)}
        />
      </DropdownMenuPrimitive.SubTrigger>
    </TextClassContext.Provider>
  );
}

function DropdownMenuSubContent({
  className,
  ref,
  ...props
}: DropdownMenuPrimitive.SubContentProps & {
  ref?: React.Ref<DropdownMenuPrimitive.SubContentRef>;
}) {
  return (
    <NativeOnlyAnimatedView entering={FadeIn}>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(
          'bg-popover border-border overflow-hidden rounded-md border p-1 shadow-lg shadow-black/5',
          Platform.select({
            web: 'animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fade-in-0 data-[state=closed]:zoom-out-95 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-context-menu-content-transform-origin) z-50 min-w-32',
          }),
          className,
        )}
        {...props}
      />
    </NativeOnlyAnimatedView>
  );
}

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function DropdownMenuContent({
  className,
  overlayClassName,
  overlayStyle,
  portalHost,
  scrollable = false,
  maxScrollableHeight = 400,
  children,
  ref,
  ...props
}: DropdownMenuPrimitive.ContentProps & {
  ref?: React.Ref<DropdownMenuPrimitive.ContentRef>;
} & {
  overlayStyle?: StyleProp<ViewStyle>;
  overlayClassName?: string;
  portalHost?: string;
  scrollable?: boolean;
  maxScrollableHeight?: number;
}) {
  return (
    <DropdownMenuPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <DropdownMenuPrimitive.Overlay
          style={Platform.select({
            web: overlayStyle ?? undefined,
            native: overlayStyle
              ? StyleSheet.flatten([
                  StyleSheet.absoluteFill,
                  overlayStyle as typeof StyleSheet.absoluteFill,
                ])
              : StyleSheet.absoluteFill,
          })}
          className={overlayClassName}>
          <NativeOnlyAnimatedView entering={FadeIn}>
            <TextClassContext.Provider value="text-popover-foreground">
              <DropdownMenuPrimitive.Content
                ref={ref}
                className={cn(
                  'bg-card border-border min-w-32 overflow-hidden rounded-md border p-1 shadow-lg shadow-black/5',
                  className,
                )}
                {...props}>
                {scrollable ? (
                  <ScrollView
                    style={{ maxHeight: maxScrollableHeight }}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}>
                    {children as React.ReactNode}
                  </ScrollView>
                ) : (
                  children
                )}
              </DropdownMenuPrimitive.Content>
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </DropdownMenuPrimitive.Overlay>
      </FullWindowOverlay>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant,
  ref,
  ...props
}: DropdownMenuPrimitive.ItemProps & {
  ref?: React.Ref<DropdownMenuPrimitive.ItemRef>;
} & {
  className?: string;
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <TextClassContext.Provider
      value={cn(
        'select-none text-sm text-popover-foreground group-active:text-popover-foreground',
        variant === 'destructive' && 'text-destructive group-active:text-destructive',
      )}>
      <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(
          'active:bg-accent group relative flex flex-row items-center gap-2 rounded-sm px-2 py-2 sm:py-1.5',
          variant === 'destructive' &&
            'active:bg-destructive/10 dark:active:bg-destructive/20',
          props.disabled && 'opacity-50',
          inset && 'pl-8',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ref,
  ...props
}: DropdownMenuPrimitive.CheckboxItemProps & {
  ref?: React.Ref<DropdownMenuPrimitive.CheckboxItemRef>;
} & {
  children?: React.ReactNode;
}) {
  return (
    <TextClassContext.Provider value="text-sm text-popover-foreground select-none group-active:text-accent-foreground">
      <DropdownMenuPrimitive.CheckboxItem
        ref={ref}
        className={cn(
          'active:bg-accent group relative flex flex-row items-center gap-2 rounded-sm py-2 pl-8 pr-2 sm:py-1.5',
          Platform.select({
            web: 'focus:bg-accent focus:text-accent-foreground cursor-default outline-none data-disabled:pointer-events-none',
          }),
          props.disabled && 'opacity-50',
          className,
        )}
        {...props}>
        <View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <DropdownMenuPrimitive.ItemIndicator>
            <Icon as={Check} className="text-foreground size-4" />
          </DropdownMenuPrimitive.ItemIndicator>
        </View>
        <>{children}</>
      </DropdownMenuPrimitive.CheckboxItem>
    </TextClassContext.Provider>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ref,
  ...props
}: DropdownMenuPrimitive.RadioItemProps & {
  ref?: React.Ref<DropdownMenuPrimitive.RadioItemRef>;
} & {
  children?: React.ReactNode;
}) {
  return (
    <TextClassContext.Provider value="text-sm text-popover-foreground select-none group-active:text-accent-foreground">
      <DropdownMenuPrimitive.RadioItem
        ref={ref}
        className={cn(
          'active:bg-accent group relative flex flex-row items-center gap-2 rounded-sm py-2 pl-8 pr-2 sm:py-1.5',
          Platform.select({
            web: 'focus:bg-accent focus:text-accent-foreground cursor-default outline-none data-disabled:pointer-events-none',
          }),
          props.disabled && 'opacity-50',
          className,
        )}
        {...props}>
        <View className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <DropdownMenuPrimitive.ItemIndicator>
            <View className="bg-foreground h-2 w-2 rounded-full" />
          </DropdownMenuPrimitive.ItemIndicator>
        </View>
        <>{children}</>
      </DropdownMenuPrimitive.RadioItem>
    </TextClassContext.Provider>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ref,
  ...props
}: DropdownMenuPrimitive.LabelProps & {
  ref?: React.Ref<DropdownMenuPrimitive.LabelRef>;
} & {
  className?: string;
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        'text-foreground px-2 py-2 text-sm font-medium sm:py-1.5',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ref,
  ...props
}: DropdownMenuPrimitive.SeparatorProps & {
  ref?: React.Ref<DropdownMenuPrimitive.SeparatorRef>;
}) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ref,
  ...props
}: TextProps & { ref?: React.Ref<Text> }) {
  return (
    <Text
      ref={ref}
      className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
