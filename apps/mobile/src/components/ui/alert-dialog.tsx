import * as React from 'react';
import { Modal, Platform, View, type ViewProps } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { Timer } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import * as AlertDialogPrimitive from '~/components/primitives/alert-dialog';
import { Text, TextClassContext } from '~/components/ui/text';
import { buttonTextVariants, buttonVariants } from '~/components/ui/button';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';
import { Icon } from './icon';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AndroidModalOverlay({ children }: { children: React.ReactNode }) {
  return (
    <Modal visible transparent statusBarTranslucent animationType="none">
      {children}
    </Modal>
  );
}

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : AndroidModalOverlay;

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
      <NativeOnlyAnimatedView
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        className="absolute bottom-0 left-0 right-0 top-0 z-50">
        <AlertDialogPrimitive.Overlay
          ref={ref}
          className={cn(
            'absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-2',
            className,
          )}
          {...props}>
          {children}
        </AlertDialogPrimitive.Overlay>
      </NativeOnlyAnimatedView>
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
            'bg-background border-border z-50 flex flex-col gap-4 rounded-xl border-theme p-6 shadow-theme sm:max-w-lg',
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
      className={cn('text-foreground text-lg font-body-semibold text-left', className)}
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
      className={cn('text-foreground text-base text-left', className)}
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

/**
 * AlertDialogDestructiveAction with an optional `delaySeconds` prop.
 *
 * When `delaySeconds` is provided, the button is disabled for that many seconds
 * after the dialog opens, showing a Timer icon and countdown alongside the
 * children text. The timer resets automatically when the dialog is dismissed
 * and reopened (component unmount/remount).
 */
function AlertDialogDestructiveAction({
  className,
  ref,
  delaySeconds,
  children,
  disabled,
  ...props
}: Omit<AlertDialogPrimitive.ActionProps, 'children'> & {
  children?: React.ReactNode;
  ref?: React.Ref<AlertDialogPrimitive.ActionRef>;
  delaySeconds?: number;
}) {
  const [countdown, setCountdown] = React.useState(delaySeconds ?? 0);

  React.useEffect(() => {
    if (!delaySeconds || delaySeconds <= 0) return;

    setCountdown(delaySeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [delaySeconds]);

  const isDelayed = delaySeconds != null && delaySeconds > 0 && countdown > 0;

  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant: 'destructive' })}>
      <AlertDialogPrimitive.Action
        ref={ref}
        className={cn(
          buttonVariants({ variant: 'destructive' }),
          (disabled || isDelayed) && 'opacity-50',
          className,
        )}
        disabled={disabled || isDelayed}
        {...props}>
        {delaySeconds != null ? (
          <View className="flex-row items-center justify-center gap-0.5">
            {children}
            {isDelayed && (
              <>
                <Text>(</Text>
                <Icon as={Timer} size={14} className="text-destructive-foreground" />
                <Text>{countdown})</Text>
              </>
            )}
          </View>
        ) : (
          children
        )}
      </AlertDialogPrimitive.Action>
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
  AlertDialogDestructiveAction,
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
