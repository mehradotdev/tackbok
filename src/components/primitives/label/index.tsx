import * as React from 'react';
import { Pressable, Text as RNText } from 'react-native';
import * as Slot from '~/components/primitives/slot';
import type { RootProps, RootRef, TextProps, TextRef } from './types';

const Root = (props: RootProps & { ref?: React.Ref<RootRef> }) => {
  const { asChild, ref, ...rest } = props;
  const Component = asChild ? Slot.Pressable : Pressable;
  return <Component ref={ref} {...rest} />;
};

Root.displayName = 'RootNativeLabel';

const Text = (props: TextProps & { ref?: React.Ref<TextRef> }) => {
  const { asChild, ref, ...rest } = props;
  const Component = asChild ? Slot.Text : RNText;
  return <Component ref={ref} {...rest} />;
};

Text.displayName = 'TextNativeLabel';

export { Root, Text };
export type { RootProps, RootRef, TextProps, TextRef };
