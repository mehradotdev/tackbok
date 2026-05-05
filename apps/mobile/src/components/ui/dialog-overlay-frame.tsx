import * as React from 'react';
import { Modal, Platform, View } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { cn } from 'tailwind-variants';
import { NativeOnlyAnimatedView } from '~/components/ui/native-only-animated-view';

export type AndroidOverlayStrategy = 'portal' | 'modal';

interface DialogOverlayFrameProps {
  androidOverlayStrategy?: AndroidOverlayStrategy;
  animatedContainerClassName?: string;
  children?: React.ReactNode;
  contentContainerClassName?: string;
  onRequestClose: () => void;
  overlay: React.ReactNode;
}

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

function OverlayHost({
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
    return (
      <AndroidModalOverlay onRequestClose={onRequestClose}>
        {children}
      </AndroidModalOverlay>
    );
  }

  return <>{children}</>;
}

/**
 * Shared dialog/alert-dialog frame for cross-platform portal hosting, backdrop
 * animation, and centered content positioning.
 */
export function DialogOverlayFrame({
  androidOverlayStrategy = 'portal',
  animatedContainerClassName,
  children,
  contentContainerClassName,
  onRequestClose,
  overlay,
}: DialogOverlayFrameProps) {
  return (
    <OverlayHost
      androidOverlayStrategy={androidOverlayStrategy}
      onRequestClose={onRequestClose}>
      <NativeOnlyAnimatedView
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0',
          animatedContainerClassName,
        )}>
        {overlay}
        {children ? (
          <View
            pointerEvents="box-none"
            className={cn(
              'absolute bottom-0 left-0 right-0 top-0 z-50 items-center justify-center p-2',
              contentContainerClassName,
            )}>
            {/* Keep content outside the overlay pressable so nested scroll views can win touch gestures. */}
            {children}
          </View>
        ) : null}
      </NativeOnlyAnimatedView>
    </OverlayHost>
  );
}
