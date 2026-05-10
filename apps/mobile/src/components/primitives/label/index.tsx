import * as React from 'react';
import { Pressable, Text as RNText } from 'react-native';
import { Slot } from '~/components/primitives/slot';
import type { RootProps, RootRef, TextProps, TextRef } from './types';

type RootComponentProps = RootProps & React.RefAttributes<RootRef>;

const Root = ({ asChild, ref, ...props }: RootComponentProps) => {
  const Component = asChild ? Slot : Pressable;
  return <Component ref={ref} {...props} />;
};

Root.displayName = 'RootNativeLabel';

type TextComponentProps = TextProps & React.RefAttributes<TextRef>;

const Text = ({ asChild, ref, ...props }: TextComponentProps) => {
  const Component = asChild ? Slot : RNText;
  return <Component ref={ref} {...props} />;
};

Text.displayName = 'TextNativeLabel';

export { Root, Text };
export type { RootProps, RootRef, TextProps, TextRef };
