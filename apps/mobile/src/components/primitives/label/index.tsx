import * as React from 'react';
import { Pressable } from 'react-native';
import * as Slot from '~/components/primitives/slot';
import { Text as AppText } from '~/components/ui/text';
import type { RootProps, RootRef, TextProps, TextRef } from './types';

const Root = (props: RootProps & { ref?: React.Ref<RootRef> }) => {
  const { asChild, ref, ...rest } = props;
  const Component = asChild ? Slot.Pressable : Pressable;
  return <Component ref={ref} {...rest} />;
};

Root.displayName = 'RootNativeLabel';

const Text = (props: TextProps & { ref?: React.Ref<TextRef> }) => {
  const { asChild, ref, ...rest } = props;
  const Component = asChild ? Slot.Text : AppText;
  return <Component ref={ref} {...rest} />;
};

Text.displayName = 'TextNativeLabel';

export { Root, Text };
export type { RootProps, RootRef, TextProps, TextRef };
