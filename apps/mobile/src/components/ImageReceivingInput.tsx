import type { ReactNode } from 'react';
import type { ReceivedImage } from '~/lib/clipboardPhoto';

export type ReceivedImageRejection = 'too-large' | 'invalid';

export interface ImageReceivingInputProps {
  /** A single text input that should accept images. */
  children: ReactNode;
  onImageReceived: (image: ReceivedImage) => void;
  onImageRejected: (reason: ReceivedImageRejection) => void;
}

/**
 * Lets the wrapped text input accept images from the Android keyboard, paste and
 * drag and drop (see `ImageReceivingInput.android.tsx`). Other platforms render
 * the input unchanged.
 */
export function ImageReceivingInput({ children }: ImageReceivingInputProps) {
  return children;
}
