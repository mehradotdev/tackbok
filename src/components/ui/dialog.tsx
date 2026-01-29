import * as React from 'react';
import { Platform, Text, View, type ViewProps } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { X } from 'lucide-react-native';
import { cn } from '~/lib/utils';
import * as DialogPrimitive from '~/components/primitives/dialog';
import { Icon } from '~/components/ui/icon';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function DialogOverlay({
  className,
  children,
  ref,
  ...props
}: Omit<DialogPrimitive.OverlayProps, 'asChild'> & {
  ref?: React.Ref<DialogPrimitive.OverlayRef>;
} & {
  children?: React.ReactNode;
}) {
  return (
    <FullWindowOverlay>
      <NativeOnlyAnimatedView
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        className="absolute bottom-0 left-0 right-0 top-0">
        <DialogPrimitive.Overlay
          ref={ref}
          className={cn(
            'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-2',
            className,
          )}
          {...props}>
          {children}
        </DialogPrimitive.Overlay>
      </NativeOnlyAnimatedView>
    </FullWindowOverlay>
  );
}
function DialogContent({
  className,
  portalHost,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.ContentProps & { ref?: React.Ref<DialogPrimitive.ContentRef> } & {
  portalHost?: string;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay>
        <DialogPrimitive.Content
          className={cn(
            'bg-background border-border z-50 mx-auto flex w-full flex-col',
            'gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg',
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
              <Icon as={X} className={cn('text-accent-foreground size-4 shrink-0')} />
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
}: DialogPrimitive.TitleProps & { ref?: React.Ref<DialogPrimitive.TitleRef> }) {
  return (
    <DialogPrimitive.Title
      className={cn('text-foreground text-lg font-semibold leading-none', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.DescriptionProps & {
  ref?: React.Ref<DialogPrimitive.DescriptionRef>;
}) {
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
