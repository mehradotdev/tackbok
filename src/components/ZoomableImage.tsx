import React, { useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
  cancelAnimation,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getFullPhotoUri } from '~/lib/photoUtils';

export interface ZoomableImageProps {
  uri: string;
  width?: number;
  height?: number;
  containerWidth: number;
  containerHeight: number;
  onZoomChange: (isZoomed: boolean) => void;
  onClose: () => void;
}

export function ZoomableImage({
  uri,
  width,
  height,
  containerWidth,
  containerHeight,
  onZoomChange,
  onClose,
}: ZoomableImageProps) {
  'use no memo';
  const [isZoomedState, setIsZoomedState] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // For swipe-to-dismiss
  const dismissTranslateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const imageAspectRatio = width && height ? width / height : 4 / 3;
  const containerAspectRatio = containerWidth / containerHeight;
  const isWiderThanContainer = imageAspectRatio > containerAspectRatio;

  const imageWidth = isWiderThanContainer
    ? containerWidth
    : containerHeight * imageAspectRatio;
  const imageHeight = isWiderThanContainer
    ? containerWidth / imageAspectRatio
    : containerHeight;

  const MAX_ZOOM = 8;
  const MIN_ZOOM = 0.7;
  const DISMISS_THRESHOLD = 150; // pixels to swipe before dismissing

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    savedTranslateX.value = 0;
    translateY.value = withTiming(0);
    savedTranslateY.value = 0;
  };

  const resetDismiss = () => {
    'worklet';
    dismissTranslateY.value = withSpring(0, { damping: 50, stiffness: 500 });
    opacity.value = withTiming(1, { duration: 200 });
  };

  // Helper to clamp translation within boundaries
  const clampTranslation = (
    translate: number,
    imageSize: number,
    containerSize: number,
    currentScale: number,
  ) => {
    'worklet';
    const scaledImageSize = imageSize * currentScale;
    const maxTranslate = Math.max(0, (scaledImageSize - containerSize) / 2);
    return Math.max(-maxTranslate, Math.min(maxTranslate, translate));
  };

  useDerivedValue(() => {
    const isZoomed = scale.value > 1.1; // Small threshold
    scheduleOnRN(onZoomChange, isZoomed);
    scheduleOnRN(setIsZoomedState, isZoomed);
  });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    })
    .onUpdate((e) => {
      // Allow zoom between MIN_ZOOM (0.7) and MAX_ZOOM (8)
      const newScale = savedScale.value * e.scale;
      scale.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

      // When zooming, also adjust translation to stay within bounds
      translateX.value = clampTranslation(
        savedTranslateX.value,
        imageWidth,
        containerWidth,
        scale.value,
      );
      translateY.value = clampTranslation(
        savedTranslateY.value,
        imageHeight,
        containerHeight,
        scale.value,
      );
    })
    .onEnd(() => {
      if (scale.value < 1) {
        // Animate back to normal if zoomed out below 1x
        reset();
      } else {
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const pan = Gesture.Pan()
    .enabled(isZoomedState)
    .averageTouches(true)
    .onStart(() => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    })
    .onUpdate((e) => {
      if (scale.value > 1) {
        const newTranslateX = savedTranslateX.value + e.translationX;
        const newTranslateY = savedTranslateY.value + e.translationY;

        // Apply boundary constraints to prevent panning beyond image edges
        translateX.value = clampTranslation(
          newTranslateX,
          imageWidth,
          containerWidth,
          scale.value,
        );
        translateY.value = clampTranslation(
          newTranslateY,
          imageHeight,
          containerHeight,
          scale.value,
        );
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Swipe to dismiss gesture - only active when not zoomed
  const swipeToDismiss = Gesture.Pan()
    .enabled(!isZoomedState)
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onUpdate((e) => {
      if (scale.value <= 1.1) {
        dismissTranslateY.value = e.translationY;
        // Calculate opacity based on distance (fade out as you swipe)
        const progress = Math.min(Math.abs(e.translationY) / DISMISS_THRESHOLD, 1);
        opacity.value = 1 - progress * 0.5; // Fade to 50% opacity at threshold
      }
    })
    .onEnd((e) => {
      if (Math.abs(dismissTranslateY.value) > DISMISS_THRESHOLD) {
        // Dismiss the modal
        scheduleOnRN(onClose);
      } else {
        // Animate back to original position
        resetDismiss();
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.5) {
        reset();
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
        translateX.value = withTiming(0);
        savedTranslateX.value = 0;
        translateY.value = withTiming(0);
        savedTranslateY.value = 0;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissTranslateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const composed = Gesture.Simultaneous(pinch, pan, swipeToDismiss, doubleTap);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          {
            width: containerWidth,
            height: containerHeight,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}>
        <Animated.Image
          source={{ uri: getFullPhotoUri(uri) }}
          style={[
            {
              width: imageWidth,
              height: imageHeight,
            },
            animatedStyle,
          ]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}
