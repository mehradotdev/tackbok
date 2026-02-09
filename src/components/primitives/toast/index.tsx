import * as Slot from '~/components/primitives/slot';
import * as React from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import type {
  ActionProps,
  ActionRef,
  CloseProps,
  CloseRef,
  DescriptionProps,
  DescriptionRef,
  RootProps,
  RootRef,
  TitleProps,
  TitleRef,
} from './types';

interface RootContext extends RootProps {
  nativeID: string;
}
const ToastContext = React.createContext<RootContext | null>(null);

const Root = ({
  asChild,
  type = 'foreground',
  open,
  onOpenChange,
  ref,
  ...viewProps
}: RootProps & { ref?: React.Ref<RootRef> }) => {
  const nativeID = React.useId();

  if (!open) {
    return null;
  }

  const Component = asChild ? Slot.View : View;
  return (
    <ToastContext.Provider
      value={{
        open,
        onOpenChange,
        type,
        nativeID,
      }}>
      <Component
        ref={ref}
        role="status"
        aria-live={type === 'foreground' ? 'assertive' : 'polite'}
        {...viewProps}
      />
    </ToastContext.Provider>
  );
};

Root.displayName = 'RootToast';

function useToastContext() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error(
      'Toast compound components cannot be rendered outside the Toast component',
    );
  }
  return context;
}

const Close = ({
  asChild,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: CloseProps & { ref?: React.Ref<CloseRef> }) => {
  const { onOpenChange } = useToastContext();

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

Close.displayName = 'CloseToast';

const Action = ({
  asChild,
  onPress: onPressProp,
  disabled = false,
  ref,
  ...props
}: ActionProps & { ref?: React.Ref<ActionRef> }) => {
  const { onOpenChange } = useToastContext();

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

Action.displayName = 'ActionToast';

const Title = ({
  asChild,
  ref,
  ...props
}: TitleProps & { ref?: React.Ref<TitleRef> }) => {
  const { nativeID } = useToastContext();

  const Component = asChild ? Slot.Text : Text;
  return <Component ref={ref} role="heading" nativeID={`${nativeID}_label`} {...props} />;
};

Title.displayName = 'TitleToast';

const Description = ({
  asChild,
  ref,
  ...props
}: DescriptionProps & { ref?: React.Ref<DescriptionRef> }) => {
  const { nativeID } = useToastContext();

  const Component = asChild ? Slot.Text : Text;
  return <Component ref={ref} nativeID={`${nativeID}_desc`} {...props} />;
};

Description.displayName = 'DescriptionToast';

export { Action, Close, Description, Root, Title };
