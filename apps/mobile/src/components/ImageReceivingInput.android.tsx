import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { NativeSyntheticEvent } from 'react-native';
import type { ReceivedImage } from '~/lib/clipboardPhoto';
import type {
  ImageReceivingInputProps,
  ReceivedImageRejection,
} from './ImageReceivingInput';

interface NativeProps {
  children: ImageReceivingInputProps['children'];
  onImageReceived: (event: NativeSyntheticEvent<ReceivedImage>) => void;
  onImageRejected: (
    event: NativeSyntheticEvent<{ reason: ReceivedImageRejection }>,
  ) => void;
}

// Binaries built before this view existed can still receive this JS through an
// update; they render the input without image support.
const NativeImageReceivingInput = requireOptionalNativeModule('ImageReceivingInputModule')
  ? requireNativeView<NativeProps>('ImageReceivingInputModule')
  : null;

/**
 * Lets the wrapped text input accept images from the keyboard (clipboard chip,
 * stickers and GIFs), long-press Paste and drag and drop. Text is unaffected.
 * Each received image arrives as a temporary cache copy the caller must delete.
 */
export function ImageReceivingInput({
  children,
  onImageReceived,
  onImageRejected,
}: ImageReceivingInputProps) {
  if (!NativeImageReceivingInput) return children;
  return (
    <NativeImageReceivingInput
      onImageReceived={(event) => onImageReceived(event.nativeEvent)}
      onImageRejected={(event) => onImageRejected(event.nativeEvent.reason)}>
      {children}
    </NativeImageReceivingInput>
  );
}
