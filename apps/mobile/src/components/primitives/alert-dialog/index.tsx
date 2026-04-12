import { useControllableState } from '~/components/primitives/hooks';
import { Portal as RNPPortal } from '~/components/primitives/portal';
import * as Slot from '~/components/primitives/slot';
import * as React from 'react';
import {
  BackHandler,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import type {
  ActionProps,
  ActionRef,
  CancelProps,
  CancelRef,
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

const AlertDialogContext = React.createContext<
  (RootContext & { nativeID: string }) | null
>(null);

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
  const [open = false, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });
  const Component = asChild ? Slot.View : View;
  return (
    <AlertDialogContext.Provider
      value={{
        open,
        onOpenChange,
        nativeID,
        dismissible,
      }}>
      <Component ref={ref} {...viewProps} />
    </AlertDialogContext.Provider>
  );
};

Root.displayName = 'RootNativeAlertDialog';

function useRootContext() {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error(
      'AlertDialog compound components cannot be rendered outside the AlertDialog component',
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
    onOpenChange(!open);
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

Trigger.displayName = 'TriggerNativeAlertDialog';

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
      <AlertDialogContext.Provider value={value}>{children}</AlertDialogContext.Provider>
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

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  function onPress() {
    if (dismissible) {
      onOpenChange(false);
    }
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return <Component ref={ref} onPress={onPress} {...props} />;
};

Overlay.displayName = 'OverlayNativeAlertDialog';

const Content = ({
  asChild,
  forceMount,
  ref,
  ...props
}: ContentProps & { ref?: React.Ref<ContentRef> }) => {
  const { open, nativeID, onOpenChange, dismissible } = useRootContext();

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

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.View : View;
  return (
    <Component
      ref={ref}
      role="alertdialog"
      nativeID={nativeID}
      aria-labelledby={`${nativeID}_label`}
      aria-describedby={`${nativeID}_desc`}
      aria-modal={true}
      {...props}
    />
  );
};

Content.displayName = 'ContentNativeAlertDialog';

const Cancel = ({
  asChild,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: CancelProps & { ref?: React.Ref<CancelRef> }) => {
  const { onOpenChange } = useRootContext();

  function onPress(ev: GestureResponderEvent) {
    if (disabled) return;
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

Cancel.displayName = 'CloseNativeAlertDialog';

const Action = ({
  asChild,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: ActionProps & { ref?: React.Ref<ActionRef> }) => {
  const { onOpenChange } = useRootContext();

  function onPress(ev: GestureResponderEvent) {
    if (disabled) return;
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

Action.displayName = 'ActionNativeAlertDialog';

const Title = ({
  asChild,
  ref,
  ...props
}: TitleProps & { ref?: React.Ref<TitleRef> }) => {
  const { nativeID } = useRootContext();
  const Component = asChild ? Slot.Text : Text;
  return <Component ref={ref} role="heading" nativeID={`${nativeID}_label`} {...props} />;
};

Title.displayName = 'TitleNativeAlertDialog';

const Description = ({
  asChild,
  ref,
  ...props
}: DescriptionProps & { ref?: React.Ref<DescriptionRef> }) => {
  const { nativeID } = useRootContext();
  const Component = asChild ? Slot.Text : Text;
  return <Component ref={ref} nativeID={`${nativeID}_desc`} {...props} />;
};

Description.displayName = 'DescriptionNativeAlertDialog';

export {
  Action,
  Cancel,
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
  ActionProps,
  ActionRef,
  CancelProps,
  CancelRef,
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
