import * as React from 'react';
import { Modal, Platform, View, type ViewProps } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import * as DialogPrimitive from '~/components/primitives/dialog';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';

type AndroidOverlayStrategy = 'portal' | 'modal';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function AndroidModalOverlay({
  children,
  onRequestClose,
}: {
  children: React.ReactNode;
  onRequestClose: () => void;
}) {
  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

function OverlayContainer({
  androidOverlayStrategy,
  children,
  onRequestClose,
}: {
  androidOverlayStrategy: AndroidOverlayStrategy;
  children: React.ReactNode;
  onRequestClose: () => void;
}) {
  if (Platform.OS === 'ios') {
    return <RNFullWindowOverlay>{children}</RNFullWindowOverlay>;
  }

  if (Platform.OS === 'android' && androidOverlayStrategy === 'modal') {
    return <AndroidModalOverlay onRequestClose={onRequestClose}>{children}</AndroidModalOverlay>;
  }

  return <>{children}</>;
}

function DialogOverlay({
  androidOverlayStrategy = 'portal',
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, 'asChild'> & {
  androidOverlayStrategy?: AndroidOverlayStrategy;
} & {
  children?: React.ReactNode;
}) {
  const { dismissible = true, onOpenChange } = DialogPrimitive.useRootContext();

  return (
    <OverlayContainer
      androidOverlayStrategy={androidOverlayStrategy}
      onRequestClose={() => {
        if (dismissible) {
          onOpenChange(false);
        }
      }}>
      <NativeOnlyAnimatedView
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        className="absolute bottom-0 left-0 right-0 top-0">
        <DialogPrimitive.Overlay
          className={cn(
            'absolute bottom-0 left-0 right-0 top-0 z-40 bg-black/50',
            className,
          )}
          {...props}
        />
        {children ? (
          <View
            pointerEvents="box-none"
            className="absolute bottom-0 left-0 right-0 top-0 z-50 items-center justify-center p-2">
            {/* Keep content outside the overlay pressable so nested scroll views can win touch gestures. */}
            {children}
          </View>
        ) : null}
      </NativeOnlyAnimatedView>
    </OverlayContainer>
  );
}
function DialogContent({
  androidOverlayStrategy = 'portal',
  className,
  portalHost,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  androidOverlayStrategy?: AndroidOverlayStrategy;
  portalHost?: string;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay androidOverlayStrategy={androidOverlayStrategy}>
        <DialogPrimitive.Content
          className={cn(
            'bg-background border-border z-50 mx-auto flex w-full flex-col',
            'gap-4 rounded-xl border-theme p-6 shadow-theme sm:max-w-lg',
            className,
          )}
          {...props}>
          <>{children}</>
          {showCloseButton && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 rounded opacity-70 active:opacity-100',
              )}
              hitSlop={12}>
              <Icon as={X} className={cn('text-foreground size-4 shrink-0')} />
              <Text className="sr-only">Close</Text>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-foreground text-lg font-body-semibold leading-none', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
