import * as React from 'react';
import {
  BackHandler,
  useWindowDimensions,
  type LayoutRectangle,
} from 'react-native';
import { useComposedRefs } from './use-compose-refs';
import { useEffectEvent } from './useEffectEvent';
import type { LayoutPosition } from './useRelativePosition';

type MeasureCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void;

interface AnchoredTriggerRef {
  close: () => void;
  measure: (callback: MeasureCallback) => void;
  open: () => void;
}

interface UseAnchoredTriggerControllerArgs<T extends AnchoredTriggerRef> {
  ref?: React.Ref<T>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setTriggerPosition: (triggerPosition: LayoutPosition | null) => void;
}

/**
 * Centralizes the native-only trigger bookkeeping shared by anchored menus and
 * selects: imperative open/close methods, trigger measurement, and re-measurement
 * after window size changes while the popup is open.
 */
export function useAnchoredTriggerController<T extends AnchoredTriggerRef>({
  ref,
  open,
  onOpenChange,
  setTriggerPosition,
}: UseAnchoredTriggerControllerArgs<T>) {
  const triggerRef = React.useRef<T>(null);
  const { width, height } = useWindowDimensions();

  const measureTrigger = React.useCallback(() => {
    triggerRef.current?.measure((_x, _y, triggerWidth, triggerHeight, pageX, pageY) => {
      setTriggerPosition({
        width: triggerWidth,
        pageX,
        pageY,
        height: triggerHeight,
      });
    });
  }, [setTriggerPosition]);

  const openTriggerEvent = useEffectEvent(() => {
    onOpenChange(true);
    measureTrigger();
  });

  const closeTriggerEvent = useEffectEvent(() => {
    setTriggerPosition(null);
    onOpenChange(false);
  });

  const composedRef = useComposedRefs(
    triggerRef,
    ref,
    React.useCallback(
      (node: T | null) => {
        if (!node) return;
        node.open = () => openTriggerEvent();
        node.close = () => closeTriggerEvent();
      },
      [closeTriggerEvent, openTriggerEvent],
    ),
  );

  React.useEffect(() => {
    if (!open) return;
    measureTrigger();
  }, [height, measureTrigger, open, width]);

  return { composedRef, measureTrigger };
}

interface UseAnchoredContentDismissArgs {
  onOpenChange: (open: boolean) => void;
  setContentLayout: (contentLayout: LayoutRectangle | null) => void;
  setTriggerPosition: (triggerPosition: LayoutPosition | null) => void;
}

/**
 * Keeps the close sequence consistent everywhere a popup can be dismissed.
 */
export function useAnchoredContentDismiss({
  onOpenChange,
  setContentLayout,
  setTriggerPosition,
}: UseAnchoredContentDismissArgs) {
  return React.useCallback(() => {
    setTriggerPosition(null);
    setContentLayout(null);
    onOpenChange(false);
  }, [onOpenChange, setContentLayout, setTriggerPosition]);
}

interface UseDismissibleAnchoredContentArgs extends UseAnchoredContentDismissArgs {
  open: boolean;
}

/**
 * Intercepts the Android hardware back button only while popup content is open.
 */
export function useDismissibleAnchoredContent({
  open,
  onOpenChange,
  setContentLayout,
  setTriggerPosition,
}: UseDismissibleAnchoredContentArgs) {
  const dismissContent = useAnchoredContentDismiss({
    onOpenChange,
    setContentLayout,
    setTriggerPosition,
  });

  React.useEffect(() => {
    if (!open) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissContent();
      return true;
    });

    return () => {
      setContentLayout(null);
      backHandler.remove();
    };
  }, [dismissContent, open, setContentLayout]);

  return { dismissContent };
}