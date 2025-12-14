import {
  useAugmentedRef,
  useControllableState,
  useRelativePosition,
  type LayoutPosition,
} from '~/components/primitives/hooks';
import { Portal as RNPPortal } from '~/components/primitives/portal';
import * as Slot from '~/components/primitives/slot';
import * as React from 'react';
import {
  BackHandler,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
import type {
  CheckboxItemProps,
  CheckboxItemRef,
  ContentProps,
  ContentRef,
  GroupProps,
  GroupRef,
  ItemIndicatorProps,
  ItemIndicatorRef,
  ItemProps,
  ItemRef,
  LabelProps,
  LabelRef,
  OverlayProps,
  OverlayRef,
  PortalProps,
  RadioGroupProps,
  RadioGroupRef,
  RadioItemProps,
  RadioItemRef,
  RootProps,
  RootRef,
  SeparatorProps,
  SeparatorRef,
  SubContentProps,
  SubContentRef,
  SubProps,
  SubRef,
  SubTriggerProps,
  SubTriggerRef,
  TriggerProps,
  TriggerRef,
} from './types';

interface IRootContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition: LayoutPosition | null;
  setTriggerPosition: (triggerPosition: LayoutPosition | null) => void;
  contentLayout: LayoutRectangle | null;
  setContentLayout: (contentLayout: LayoutRectangle | null) => void;
  nativeID: string;
}

const RootContext = React.createContext<IRootContext | null>(null);

const Root = ({
  asChild,
  onOpenChange: onOpenChangeProp,
  ref,
  ...viewProps
}: RootProps & { ref?: React.Ref<RootRef> }) => {
  const nativeID = React.useId();
  const [triggerPosition, setTriggerPosition] = React.useState<LayoutPosition | null>(
    null
  );
  const [contentLayout, setContentLayout] = React.useState<LayoutRectangle | null>(null);
  const [open, setOpen] = React.useState(false);

  function onOpenChange(open: boolean) {
    setOpen(open);
    onOpenChangeProp?.(open);
  }

  const Component = asChild ? Slot.View : View;
  return (
    <RootContext.Provider
      value={{
        open,
        onOpenChange,
        contentLayout,
        setContentLayout,
        nativeID,
        setTriggerPosition,
        triggerPosition,
      }}
    >
      <Component ref={ref} {...viewProps} />
    </RootContext.Provider>
  );
};

Root.displayName = 'RootNativeDropdownMenu';

function useRootContext() {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'DropdownMenu compound components cannot be rendered outside the DropdownMenu component'
    );
  }
  return context;
}

const Trigger = ({
  asChild,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: TriggerProps & { ref?: React.Ref<TriggerRef> }) => {
  const { open, onOpenChange, setTriggerPosition } = useRootContext();

  const augmentedRef = useAugmentedRef({
    ref,
    methods: {
      open: () => {
        onOpenChange(true);
        augmentedRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
          setTriggerPosition({ width, pageX, pageY: pageY, height });
        });
      },
      close: () => {
        setTriggerPosition(null);
        onOpenChange(false);
      },
    },
  });

  function onPress(ev: GestureResponderEvent) {
    if (disabled) return;
    augmentedRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      setTriggerPosition({ width, pageX, pageY: pageY, height });
    });
    const newValue = !open;
    onOpenChange(newValue);
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={augmentedRef}
      aria-disabled={disabled ?? undefined}
      role="button"
      onPress={onPress}
      disabled={disabled ?? undefined}
      aria-expanded={open}
      {...props}
    />
  );
};

Trigger.displayName = 'TriggerNativeDropdownMenu';

/**
 * @warning when using a custom `<PortalHost />`, you might have to adjust the Content's sideOffset to account for nav elements like headers.
 */
function Portal({ forceMount, hostName, children }: PortalProps) {
  const value = useRootContext();

  if (!value.triggerPosition) {
    return null;
  }

  if (!forceMount) {
    if (!value.open) {
      return null;
    }
  }

  return (
    <RNPPortal hostName={hostName} name={`${value.nativeID}_portal`}>
      <RootContext.Provider value={value}>{children}</RootContext.Provider>
    </RNPPortal>
  );
}

const Overlay = ({
  asChild,
  forceMount,
  onPress: OnPressProp,
  closeOnPress = true,
  ref,
  ...props
}: OverlayProps & { ref?: React.Ref<OverlayRef> }) => {
  const { open, onOpenChange, setContentLayout, setTriggerPosition } = useRootContext();

  function onPress(ev: GestureResponderEvent) {
    if (closeOnPress) {
      setTriggerPosition(null);
      setContentLayout(null);
      onOpenChange(false);
    }
    OnPressProp?.(ev);
  }

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return <Component ref={ref} onPress={onPress} {...props} />;
};

Overlay.displayName = 'OverlayNativeDropdownMenu';

/**
 * @info `position`, `top`, `left`, and `maxWidth` style properties are controlled internally. Opt out of this behavior by setting `disablePositioningStyle` to `true`.
 */
const Content = ({
  asChild = false,
  forceMount,
  align = 'start',
  side = 'bottom',
  sideOffset = 0,
  alignOffset = 0,
  avoidCollisions = true,
  onLayout: onLayoutProp,
  insets,
  style,
  disablePositioningStyle,
  ref,
  ...props
}: ContentProps & { ref?: React.Ref<ContentRef> }) => {
  const {
    open,
    onOpenChange,
    nativeID,
    triggerPosition,
    setTriggerPosition,
    contentLayout,
    setContentLayout,
  } = useRootContext();

  React.useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      setTriggerPosition(null);
      setContentLayout(null);
      onOpenChange(false);
      return true;
    });

    return () => {
      setContentLayout(null);
      backHandler.remove();
    };
  }, []);

  const positionStyle = useRelativePosition({
    align,
    avoidCollisions,
    triggerPosition,
    contentLayout,
    alignOffset,
    insets,
    sideOffset,
    side,
    disablePositioningStyle,
  });

  function onLayout(event: LayoutChangeEvent) {
    setContentLayout(event.nativeEvent.layout);
    onLayoutProp?.(event);
  }

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={ref}
      role="menu"
      nativeID={nativeID}
      aria-modal={true}
      style={[positionStyle, style]}
      onLayout={onLayout}
      {...props}
    />
  );
};

Content.displayName = 'ContentNativeDropdownMenu';

const Item = ({
  asChild,
  textValue,
  onPress: onPressProp,
  disabled = false,
  closeOnPress = true,
  ref,
  ...props
}: ItemProps & { ref?: React.Ref<ItemRef> }) => {
  const { onOpenChange, setTriggerPosition, setContentLayout } = useRootContext();

  function onPress(ev: GestureResponderEvent) {
    if (closeOnPress) {
      setTriggerPosition(null);
      setContentLayout(null);
      onOpenChange(false);
    }
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={ref}
      role="menuitem"
      onPress={onPress}
      disabled={disabled}
      aria-valuetext={textValue}
      aria-disabled={!!disabled}
      accessibilityState={{ disabled: !!disabled }}
      {...props}
    />
  );
};

Item.displayName = 'ItemNativeDropdownMenu';

const Group = ({
  asChild,
  ref,
  ...props
}: GroupProps & { ref?: React.Ref<GroupRef> }) => {
  const Component = asChild ? Slot.View : View;
  return <Component ref={ref} role="group" {...props} />;
};

Group.displayName = 'GroupNativeDropdownMenu';

const Label = ({
  asChild,
  ref,
  ...props
}: LabelProps & { ref?: React.Ref<LabelRef> }) => {
  const Component = asChild ? Slot.Text : Text;
  return <Component ref={ref} {...props} />;
};

Label.displayName = 'LabelNativeDropdownMenu';

type FormItemContext =
  | { checked: boolean }
  | {
      value: string | undefined;
      onValueChange: (value: string) => void;
    };

const FormItemContext = React.createContext<FormItemContext | null>(null);

const CheckboxItem = ({
  asChild,
  checked,
  onCheckedChange,
  textValue,
  onPress: onPressProp,
  closeOnPress = true,
  disabled = false,
  ref,
  ...props
}: CheckboxItemProps & { ref?: React.Ref<CheckboxItemRef> }) => {
  const { onOpenChange, setContentLayout, setTriggerPosition, nativeID } =
    useRootContext();

  function onPress(ev: GestureResponderEvent) {
    onCheckedChange(!checked);
    if (closeOnPress) {
      setTriggerPosition(null);
      setContentLayout(null);
      onOpenChange(false);
    }
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <FormItemContext.Provider value={{ checked }}>
      <Component
        ref={ref}
        role="checkbox"
        aria-checked={checked}
        onPress={onPress}
        disabled={disabled}
        aria-disabled={!!disabled}
        aria-valuetext={textValue}
        accessibilityState={{ disabled: !!disabled }}
        {...props}
      />
    </FormItemContext.Provider>
  );
};

CheckboxItem.displayName = 'CheckboxItemNativeDropdownMenu';

function useFormItemContext() {
  const context = React.useContext(FormItemContext);
  if (!context) {
    throw new Error(
      'CheckboxItem or RadioItem compound components cannot be rendered outside of a CheckboxItem or RadioItem component'
    );
  }
  return context;
}

const RadioGroup = ({
  asChild,
  value,
  onValueChange,
  ref,
  ...props
}: RadioGroupProps & { ref?: React.Ref<RadioGroupRef> }) => {
  const Component = asChild ? Slot.View : View;
  return (
    <FormItemContext.Provider value={{ value, onValueChange }}>
      <Component ref={ref} role="radiogroup" {...props} />
    </FormItemContext.Provider>
  );
};

RadioGroup.displayName = 'RadioGroupNativeDropdownMenu';

type BothFormItemContext = Exclude<FormItemContext, { checked: boolean }> & {
  checked: boolean;
};

const RadioItemContext = React.createContext({} as { itemValue: string });

const RadioItem = ({
  asChild,
  value: itemValue,
  textValue,
  onPress: onPressProp,
  disabled = false,
  closeOnPress = true,
  ref,
  ...props
}: RadioItemProps & { ref?: React.Ref<RadioItemRef> }) => {
  const { onOpenChange, setContentLayout, setTriggerPosition } = useRootContext();

  const { value, onValueChange } = useFormItemContext() as BothFormItemContext;
  function onPress(ev: GestureResponderEvent) {
    onValueChange(itemValue);
    if (closeOnPress) {
      setTriggerPosition(null);
      setContentLayout(null);
      onOpenChange(false);
    }
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <RadioItemContext.Provider value={{ itemValue }}>
      <Component
        ref={ref}
        onPress={onPress}
        role="radio"
        aria-checked={value === itemValue}
        disabled={disabled ?? false}
        accessibilityState={{
          disabled: disabled ?? false,
          checked: value === itemValue,
        }}
        aria-valuetext={textValue}
        {...props}
      />
    </RadioItemContext.Provider>
  );
};

RadioItem.displayName = 'RadioItemNativeDropdownMenu';

function useItemIndicatorContext() {
  return React.useContext(RadioItemContext);
}

const ItemIndicator = ({
  asChild,
  forceMount,
  ref,
  ...props
}: ItemIndicatorProps & { ref?: React.Ref<ItemIndicatorRef> }) => {
  const { itemValue } = useItemIndicatorContext();
  const { checked, value } = useFormItemContext() as BothFormItemContext;

  if (!forceMount) {
    if (itemValue == null && !checked) {
      return null;
    }
    if (value !== itemValue) {
      return null;
    }
  }
  const Component = asChild ? Slot.View : View;
  return <Component ref={ref} role="presentation" {...props} />;
};

ItemIndicator.displayName = 'ItemIndicatorNativeDropdownMenu';

const Separator = ({
  asChild,
  decorative,
  ref,
  ...props
}: SeparatorProps & { ref?: React.Ref<SeparatorRef> }) => {
  const Component = asChild ? Slot.View : View;
  return (
    <Component role={decorative ? 'presentation' : 'separator'} ref={ref} {...props} />
  );
};

Separator.displayName = 'SeparatorNativeDropdownMenu';

const SubContext = React.createContext<{
  nativeID: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
} | null>(null);

const Sub = ({
  asChild,
  defaultOpen,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  ref,
  ...props
}: SubProps & { ref?: React.Ref<SubRef> }) => {
  const nativeID = React.useId();
  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  const Component = asChild ? Slot.View : View;
  return (
    <SubContext.Provider
      value={{
        nativeID,
        open,
        onOpenChange,
      }}
    >
      <Component ref={ref} {...props} />
    </SubContext.Provider>
  );
};

Sub.displayName = 'SubNativeDropdownMenu';

function useSubContext() {
  const context = React.useContext(SubContext);
  if (!context) {
    throw new Error(
      'Sub compound components cannot be rendered outside of a Sub component'
    );
  }
  return context;
}

const SubTrigger = ({
  asChild,
  textValue,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: SubTriggerProps & { ref?: React.Ref<SubTriggerRef> }) => {
  const { nativeID, open, onOpenChange } = useSubContext();

  function onPress(ev: GestureResponderEvent) {
    onOpenChange(!open);
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={ref}
      aria-valuetext={textValue}
      role="menuitem"
      aria-expanded={open}
      accessibilityState={{ expanded: open, disabled: !!disabled }}
      nativeID={nativeID}
      onPress={onPress}
      disabled={disabled}
      aria-disabled={!!disabled}
      {...props}
    />
  );
};

SubTrigger.displayName = 'SubTriggerNativeDropdownMenu';

const SubContent = ({
  asChild = false,
  forceMount,
  ref,
  ...props
}: SubContentProps & { ref?: React.Ref<SubContentRef> }) => {
  const { open, nativeID } = useSubContext();

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return <Component ref={ref} role="group" aria-labelledby={nativeID} {...props} />;
};

Content.displayName = 'ContentNativeDropdownMenu';

export {
  CheckboxItem,
  Content,
  Group,
  Item,
  ItemIndicator,
  Label,
  Overlay,
  Portal,
  RadioGroup,
  RadioItem,
  Root,
  Separator,
  Sub,
  SubContent,
  SubTrigger,
  Trigger,
  useRootContext,
  useSubContext,

  // Export types
  CheckboxItemProps,
  CheckboxItemRef,
  ContentProps,
  ContentRef,
  GroupProps,
  GroupRef,
  ItemIndicatorProps,
  ItemIndicatorRef,
  ItemProps,
  ItemRef,
  LabelProps,
  LabelRef,
  OverlayProps,
  OverlayRef,
  PortalProps,
  RadioGroupProps,
  RadioGroupRef,
  RadioItemProps,
  RadioItemRef,
  RootProps,
  RootRef,
  SeparatorProps,
  SeparatorRef,
  SubContentProps,
  SubContentRef,
  SubProps,
  SubRef,
  SubTriggerProps,
  SubTriggerRef,
  TriggerProps,
  TriggerRef,
};
