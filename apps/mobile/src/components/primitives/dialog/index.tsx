import * as React from 'react';
import { BackHandler, GestureResponderEvent, Pressable, Text, View } from 'react-native';
import {
  NavigationContext,
  usePreventRemove,
} from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useControllableState } from '~/components/primitives/hooks';
import { Portal as RNPPortal } from '~/components/primitives/portal';
import * as Slot from '~/components/primitives/slot';
import type {
  CloseProps,
  CloseRef,
  ContentProps,
  ContentRef,
  DescriptionProps,
  DescriptionRef,
  OverlayProps,
  OverlayRef,
  PortalProps,
  RootContext,
  RootProps,
  RootRef,
  TitleProps,
  TitleRef,
  TriggerProps,
  TriggerRef,
} from './types';

type DialogNavigation = NavigationProp<ParamListBase>;

type DialogContextValue = RootContext & {
  nativeID: string;
  navigation?: DialogNavigation;
  allowNavigationRemoval: boolean;
  setAllowNavigationRemoval: React.Dispatch<React.SetStateAction<boolean>>;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function PreventNavigationRemoval({
  navigation,
  enabled,
  allowNavigationRemoval,
  setAllowNavigationRemoval,
}: {
  navigation: DialogNavigation;
  enabled: boolean;
  allowNavigationRemoval: boolean;
  setAllowNavigationRemoval: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  // Guard route removal while a non-dismissible dialog is open.
  // This blocks iOS swipe-back and back navigation consistently.
  usePreventRemove(enabled, ({ data }) => {
    if (!allowNavigationRemoval) {
      return;
    }

    setAllowNavigationRemoval(false);
    navigation.dispatch(data.action);
  });

  return null;
}

const Root = ({
  asChild,
  open: openProp,
  defaultOpen,
  onOpenChange: onOpenChangeProp,
  dismissible = true,
  ref,
  ...viewProps
}: RootProps & { ref?: React.Ref<RootRef> }) => {
  const nativeID = React.useId();
  // Optional so this primitive can also render in tests/Storybook without a navigator.
  const navigation = React.useContext(NavigationContext) as DialogNavigation | undefined;
  const [allowNavigationRemoval, setAllowNavigationRemoval] = React.useState(false);
  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  const Component = asChild ? Slot.View : View;
  return (
    <DialogContext.Provider
      value={{
        open,
        onOpenChange,
        nativeID,
        dismissible,
        navigation,
        allowNavigationRemoval,
        setAllowNavigationRemoval,
      }}>
      <Component ref={ref} {...viewProps} />
    </DialogContext.Provider>
  );
};

Root.displayName = 'RootNativeDialog';

function useRootContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error(
      'Dialog compound components cannot be rendered outside the Dialog component',
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
  const { open, onOpenChange } = useRootContext();

  function onPress(ev: GestureResponderEvent) {
    if (disabled) return;
    const newValue = !open;
    onOpenChange(newValue);
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={ref}
      aria-disabled={disabled ?? undefined}
      role="button"
      onPress={onPress}
      disabled={disabled ?? undefined}
      {...props}
    />
  );
};

Trigger.displayName = 'TriggerNativeDialog';

/**
 * @warning when using a custom `<PortalHost />`, you might have to adjust the Content's sideOffset to account for nav elements like headers.
 */
function Portal({ forceMount, hostName, children }: PortalProps) {
  const value = useRootContext();

  if (!forceMount) {
    if (!value.open) {
      return null;
    }
  }

  return (
    <RNPPortal hostName={hostName} name={`${value.nativeID}_portal`}>
      <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
    </RNPPortal>
  );
}

const Overlay = ({
  asChild,
  forceMount,
  ref,
  ...props
}: OverlayProps & { ref?: React.Ref<OverlayRef> }) => {
  const { open, onOpenChange, dismissible } = useRootContext();

  function onPress() {
    if (dismissible) {
      onOpenChange(false);
    }
  }

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return <Component ref={ref} onPress={onPress} {...props} />;
};

Overlay.displayName = 'OverlayNativeDialog';

const Content = ({
  asChild,
  forceMount,
  ref,
  ...props
}: ContentProps & { ref?: React.Ref<ContentRef> }) => {
  const {
    open,
    nativeID,
    onOpenChange,
    dismissible,
    navigation,
    allowNavigationRemoval,
    setAllowNavigationRemoval,
  } = useRootContext();

  React.useEffect(() => {
    if (!open) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dismissible) {
        return true;
      }
      onOpenChange(false);
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [dismissible, open, onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      setAllowNavigationRemoval(false);
    }
  }, [open, setAllowNavigationRemoval]);

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.View : View;
  return (
    <>
      {navigation ? (
        <PreventNavigationRemoval
          navigation={navigation}
          enabled={open && !dismissible}
          allowNavigationRemoval={allowNavigationRemoval}
          setAllowNavigationRemoval={setAllowNavigationRemoval}
        />
      ) : null}
      <Component
        ref={ref}
        role="dialog"
        nativeID={nativeID}
        aria-labelledby={`${nativeID}_label`}
        aria-describedby={`${nativeID}_desc`}
        aria-modal={true}
        {...props}
      />
    </>
  );
};

Content.displayName = 'ContentNativeDialog';

const Close = ({
  asChild,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: CloseProps & { ref?: React.Ref<CloseRef> }) => {
  const { onOpenChange, setAllowNavigationRemoval } = useRootContext();

  function onPress(ev: GestureResponderEvent) {
    if (disabled) return;
    // Allow one intentional navigation initiated by the caller after close.
    setAllowNavigationRemoval(true);
    onOpenChange(false);
    onPressProp?.(ev);
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component
      ref={ref}
      aria-disabled={disabled ?? undefined}
      role="button"
      onPress={onPress}
      disabled={disabled ?? undefined}
      {...props}
    />
  );
};

Close.displayName = 'CloseNativeDialog';

const Title = ({ ref, ...props }: TitleProps & { ref?: React.Ref<TitleRef> }) => {
  const { nativeID } = useRootContext();
  return <Text ref={ref} role="heading" nativeID={`${nativeID}_label`} {...props} />;
};

Title.displayName = 'TitleNativeDialog';

const Description = ({
  ref,
  ...props
}: DescriptionProps & { ref?: React.Ref<DescriptionRef> }) => {
  const { nativeID } = useRootContext();
  return <Text ref={ref} nativeID={`${nativeID}_desc`} {...props} />;
};

Description.displayName = 'DescriptionNativeDialog';

export {
  Close,
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
  Trigger,
  useRootContext,
};
export type {
  CloseProps,
  CloseRef,
  ContentProps,
  ContentRef,
  DescriptionProps,
  DescriptionRef,
  OverlayProps,
  OverlayRef,
  PortalProps,
  RootContext,
  RootProps,
  RootRef,
  TitleProps,
  TitleRef,
  TriggerProps,
  TriggerRef,
};
