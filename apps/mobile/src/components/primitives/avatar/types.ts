import type {
  ComponentPropsWithAsChild,
  SlottableViewProps,
  ViewRef,
} from '~/components/primitives/types';
import { Image as RNImage } from 'react-native';

type RootProps = SlottableViewProps & {
  alt: string;
};

type ImageProps = Omit<ComponentPropsWithAsChild<typeof RNImage>, 'alt'> & {
  children?: React.ReactNode;
  onLoadingStatusChange?: (status: 'error' | 'loaded') => void;
};

type FallbackProps = SlottableViewProps;

type RootRef = ViewRef;
type ImageRef = React.ComponentRef<typeof RNImage>;
type FallbackRef = ViewRef;

export type { FallbackProps, FallbackRef, ImageProps, ImageRef, RootProps, RootRef };
