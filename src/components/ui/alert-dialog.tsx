import * as React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { cn } from '~/lib/utils';
import * as AlertDialogPrimitive from '~/components/primitives/alert-dialog';
import { TextClassContext } from '~/components/ui/text';
import { buttonTextVariants, buttonVariants } from '~/components/ui/button';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function AlertDialogOverlay({
  className,
  children,
  ref,
  ...props
}: Omit<AlertDialogPrimitive.OverlayProps, 'asChild'> & {
  children?: React.ReactNode;
  ref?: React.Ref<AlertDialogPrimitive.OverlayRef>;
}) {
  return (
    <FullWindowOverlay>
      <AlertDialogPrimitive.Overlay
        ref={ref}
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-2',
          Platform.select({
            web: 'animate-in fade-in-0 fixed',
          }),
          className,
        )}
        {...props}>
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(200).delay(50)}
          exiting={FadeOut.duration(150)}>
          <>{children}</>
        </NativeOnlyAnimatedView>
      </AlertDialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function AlertDialogContent({
  className,
  portalHost,
  ref,
  ...props
}: AlertDialogPrimitive.ContentProps & {
  portalHost?: string;
  ref?: React.Ref<AlertDialogPrimitive.ContentRef>;
}) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          ref={ref}
          className={cn(
            'bg-background border-border z-50 flex flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg',
            Platform.select({
              web: 'animate-in fade-in-0 zoom-in-95 web:max-w-[calc(100%-2rem)] duration-200',
            }),
            className,
          )}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-center sm:text-left">
      <View className={cn('flex flex-col gap-2', className)} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.TitleProps & { ref?: React.Ref<AlertDialogPrimitive.TitleRef> }) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('text-foreground text-lg font-semibold text-left', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.DescriptionProps & {
  ref?: React.Ref<AlertDialogPrimitive.DescriptionRef>;
}) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('text-muted-foreground text-sm text-left', className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.ActionProps & {
  ref?: React.Ref<AlertDialogPrimitive.ActionRef>;
}) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className })}>
      <AlertDialogPrimitive.Action
        ref={ref}
        className={cn(buttonVariants(), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function AlertDialogCancel({
  className,
  ref,
  ...props
}: AlertDialogPrimitive.CancelProps & {
  ref?: React.Ref<AlertDialogPrimitive.CancelRef>;
}) {
  return (
    <TextClassContext.Provider
      value={buttonTextVariants({ className, variant: 'outline' })}>
      <AlertDialogPrimitive.Cancel
        ref={ref}
        className={cn(buttonVariants({ variant: 'outline' }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
