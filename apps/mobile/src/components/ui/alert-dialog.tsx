import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { Timer } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import * as AlertDialogPrimitive from '~/components/primitives/alert-dialog';
import { Text, TextClassContext } from '~/components/ui/text';
import { buttonTextVariants, buttonVariants } from '~/components/ui/button';
import {
  DialogOverlayFrame,
  type AndroidOverlayStrategy,
} from './dialog-overlay-frame';
import { Icon } from './icon';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({
  androidOverlayStrategy = 'portal',
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Overlay>, 'asChild'> & {
  androidOverlayStrategy?: AndroidOverlayStrategy;
  children?: React.ReactNode;
}) {
  const { dismissible = true, onOpenChange } = AlertDialogPrimitive.useRootContext();

  return (
    <DialogOverlayFrame
      androidOverlayStrategy={androidOverlayStrategy}
      animatedContainerClassName="z-50"
      onRequestClose={() => {
        if (dismissible) {
          onOpenChange(false);
        }
      }}
      overlay={
        <AlertDialogPrimitive.Overlay
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

function AlertDialogContent({
  androidOverlayStrategy = 'portal',
  className,
  portalHost,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  androidOverlayStrategy?: AndroidOverlayStrategy;
  portalHost?: string;
}) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay androidOverlayStrategy={androidOverlayStrategy}>
        <AlertDialogPrimitive.Content
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
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-foreground text-lg font-body-semibold text-left', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-foreground text-base text-left', className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className })}>
      <AlertDialogPrimitive.Action
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
  delaySeconds,
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Action>, 'children'> & {
  children?: React.ReactNode;
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
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <TextClassContext.Provider
      value={buttonTextVariants({ className, variant: 'outline' })}>
      <AlertDialogPrimitive.Cancel
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
