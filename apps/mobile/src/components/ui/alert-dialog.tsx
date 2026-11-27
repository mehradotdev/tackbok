import * as React from 'react';
import {
  ScrollView,
  useWindowDimensions,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Timer } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import * as AlertDialogPrimitive from '~/components/primitives/alert-dialog';
import { Text, TextClassContext } from '~/components/ui/text';
import { buttonTextVariants, buttonVariants } from '~/components/ui/button';
import { DialogOverlayFrame, type AndroidOverlayStrategy } from './dialog-overlay-frame';
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
  const insets = useSafeAreaInsets();
  // Keep a tall dialog clear of the notch and home indicator. The padding is
  // symmetric so a dialog that fits stays centred exactly where it was.
  // Per-side values, because per-side padding (which `p-2` may compile to)
  // outranks paddingVertical/paddingHorizontal in Yoga.
  const vertical = Math.max(insets.top, insets.bottom, 8);
  const horizontal = Math.max(insets.left, insets.right, 8);
  const frameInsets = {
    paddingTop: vertical,
    paddingBottom: vertical,
    paddingLeft: horizontal,
    paddingRight: horizontal,
  };

  return (
    <DialogOverlayFrame
      androidOverlayStrategy={androidOverlayStrategy}
      animatedContainerClassName="z-50"
      contentContainerStyle={frameInsets}
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
            'bg-background border-border z-50 flex max-h-full flex-col gap-4 rounded-xl border-theme p-6 shadow-theme sm:max-w-lg',
            className,
          )}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

/**
 * Scrolls when the title and description are taller than the space left by
 * the footer (large accessibility text sizes), so the buttons stay reachable.
 */
function AlertDialogHeader({ className, ...props }: ScrollViewProps) {
  return (
    <TextClassContext.Provider value="text-center sm:text-left">
      <ScrollView
        className="shrink grow-0"
        contentContainerClassName={cn('flex flex-col gap-2', className)}
        alwaysBounceVertical={false}
        {...props}
      />
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

/**
 * Above the default text size, lets footer buttons grow and wrap their labels
 * instead of clipping them at the fixed button height. Gated on fontScale so
 * the default size renders exactly as before. Kept apart from the caller's
 * className, which also styles the label through TextClassContext.
 */
function useLargeTextButtonClasses() {
  const { fontScale } = useWindowDimensions();
  return fontScale > 1
    ? {
        button: 'h-auto min-h-10 shrink py-2',
        text: 'shrink text-center',
        group: 'shrink',
        fixed: 'shrink-0',
      }
    : { button: undefined, text: undefined, group: undefined, fixed: undefined };
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  const largeText = useLargeTextButtonClasses();
  return (
    <TextClassContext.Provider
      value={cn(buttonTextVariants({ className }), largeText.text)}>
      <AlertDialogPrimitive.Action
        className={cn(buttonVariants(), largeText.button, className)}
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
  const largeText = useLargeTextButtonClasses();

  return (
    <TextClassContext.Provider
      value={cn(buttonTextVariants({ variant: 'destructive' }), largeText.text)}>
      <AlertDialogPrimitive.Action
        className={cn(
          buttonVariants({ variant: 'destructive' }),
          largeText.button,
          (disabled || isDelayed) && 'opacity-50',
          className,
        )}
        disabled={disabled || isDelayed}
        {...props}>
        {delaySeconds != null ? (
          <View
            className={cn(
              'flex-row items-center justify-center gap-0.5',
              largeText.group,
            )}>
            {children}
            {isDelayed && (
              <>
                <Text className={largeText.fixed}>(</Text>
                <Icon as={Timer} size={14} className="text-destructive-foreground" />
                <Text className={largeText.fixed}>{countdown})</Text>
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
  const largeText = useLargeTextButtonClasses();
  return (
    <TextClassContext.Provider
      value={cn(buttonTextVariants({ className, variant: 'outline' }), largeText.text)}>
      <AlertDialogPrimitive.Cancel
        className={cn(
          buttonVariants({ variant: 'outline' }),
          largeText.button,
          className,
        )}
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
