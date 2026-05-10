import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import * as DialogPrimitive from '~/components/primitives/dialog';
import {
  DialogOverlayFrame,
  type AndroidOverlayStrategy,
} from './dialog-overlay-frame';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

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
    <DialogOverlayFrame
      androidOverlayStrategy={androidOverlayStrategy}
      onRequestClose={() => {
        if (dismissible) {
          onOpenChange(false);
        }
      }}
      overlay={
        <DialogPrimitive.Overlay
          className={cn(
            'absolute bottom-0 left-0 right-0 top-0 z-40 bg-black/50',
            className,
          )}
          {...props}
        />
      }>
      {children}
    </DialogOverlayFrame>
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
