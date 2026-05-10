import { useIsomorphicLayoutEffect } from '~/components/primitives/hooks';
import { Slot } from '~/components/primitives/slot';
import * as React from 'react';
import {
  type ImageErrorEvent,
  type ImageLoadEvent,
  type ImageSourcePropType,
  Image as RNImage,
  View,
} from 'react-native';
import type {
  FallbackProps,
  FallbackRef,
  ImageProps,
  ImageRef,
  RootProps,
  RootRef,
} from './types';

type AvatarState = 'loading' | 'error' | 'loaded';

interface IRootContext extends RootProps {
  status: AvatarState;
  setStatus: (status: AvatarState) => void;
}

const RootContext = React.createContext<IRootContext | null>(null);
type RootComponentProps = RootProps & React.RefAttributes<RootRef>;

const Root = ({ asChild, alt, ref, ...viewProps }: RootComponentProps) => {
  const [status, setStatus] = React.useState<AvatarState>('error');
  const Component = asChild ? Slot : View;
  return (
    <RootContext.Provider value={{ alt, status, setStatus }}>
      <Component ref={ref} {...viewProps} />
    </RootContext.Provider>
  );
};

Root.displayName = 'RootAvatar';

function useRootContext() {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      'Avatar compound components cannot be rendered outside the Avatar component',
    );
  }
  return context;
}
type ImageComponentProps = ImageProps & React.RefAttributes<ImageRef>;

const Image = ({
  asChild,
  onLoad: onLoadProps,
  onError: onErrorProps,
  onLoadingStatusChange,
  ref,
  ...props
}: ImageComponentProps) => {
  const { alt, setStatus, status } = useRootContext();
  const sourceKey = getSourceKey(props?.source);

  useIsomorphicLayoutEffect(() => {
    if (sourceKey) {
      setStatus('loading');
    } else {
      setStatus('error');
    }
  }, [setStatus, sourceKey]);

  const onLoad = React.useCallback(
    (e: ImageLoadEvent) => {
      setStatus('loaded');
      onLoadingStatusChange?.('loaded');
      onLoadProps?.(e);
    },
    [onLoadProps, onLoadingStatusChange, setStatus],
  );

  const onError = React.useCallback(
    (e: ImageErrorEvent) => {
      setStatus('error');
      onLoadingStatusChange?.('error');
      onErrorProps?.(e);
    },
    [onErrorProps, onLoadingStatusChange, setStatus],
  );

  if (status === 'error') {
    return null;
  }

  const Component = asChild ? Slot : RNImage;
  return <Component ref={ref} alt={alt} onLoad={onLoad} onError={onError} {...props} />;
};

Image.displayName = 'ImageAvatar';
type FallbackComponentProps = FallbackProps & React.RefAttributes<FallbackRef>;

const Fallback = ({ asChild, ref, ...props }: FallbackComponentProps) => {
  const { alt, status } = useRootContext();

  if (status !== 'error') {
    return null;
  }
  const Component = asChild ? Slot : View;
  return <Component ref={ref} role={'img'} aria-label={alt} {...props} />;
};

Fallback.displayName = 'FallbackAvatar';

export { Fallback, Image, Root };

function getSourceKey(source?: ImageSourcePropType) {
  if (!source) {
    return null;
  }
  if (typeof source === 'number') {
    return String(source);
  }
  if (Array.isArray(source)) {
    const uris = source.map((item) => item.uri).filter(Boolean);
    return uris.length > 0 ? uris.join('|') : null;
  }
  return source.uri ?? null;
}
