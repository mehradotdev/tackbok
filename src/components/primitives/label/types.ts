import * as React from 'react';
import type { ViewStyle } from 'react-native';
import type {
  PressableRef,
  SlottablePressableProps,
  SlottableTextProps,
  TextRef,
} from '~/components/primitives/types';

type RootProps = Omit<SlottablePressableProps, 'children' | 'hitSlop' | 'style'> & {
  children: React.ReactNode;
  style?: ViewStyle;
};

type TextProps = SlottableTextProps & {
  /**
   * Equivalent to `id` so that the same value can be passed as `aria-labelledby` to the input element.
   */
  nativeID?: string;
  /**
   * WEB ONLY
   */
  htmlFor?: string;
};

type RootRef = PressableRef;

export type { RootProps, RootRef, TextProps, TextRef };
