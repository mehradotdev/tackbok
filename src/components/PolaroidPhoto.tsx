import React from 'react';
import { View, Image, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { getFullPhotoUri, getPhotoRotation } from '~/lib/photoUtils';
import { Badge } from '~/components/ui/badge';
import { Icon } from '~/components/ui/icon';

interface PolaroidPhotoProps {
  photo: {
    uri: string;
    width?: number;
    height?: number;
  };
  onRemove?: () => void;
  onPress?: () => void;
  // Optional override for total horizontal padding (screen padding + component padding)
  // Default is 48 (px-4 = 32 + p-2 = 16)
  horizontalPadding?: number;
}

export function PolaroidPhoto({
  photo,
  onRemove,
  onPress,
  horizontalPadding = 48,
}: PolaroidPhotoProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const imageAspectRatio =
    photo.width && photo.height ? photo.width / photo.height : 4 / 3;

  // Calculate constraints
  const maxLabelWidth = windowWidth - horizontalPadding - (insets.left + insets.right);

  // Constrain max height to 70% of screen height to avoid taking over the whole screen
  const maxLabelHeight = (windowHeight - insets.top - insets.bottom) * 0.7;

  // Calculate dimensions
  let targetWidth = maxLabelWidth;
  let targetHeight = targetWidth / imageAspectRatio;

  // If height exceeds max, scale down width
  if (targetHeight > maxLabelHeight) {
    targetHeight = maxLabelHeight;
    targetWidth = targetHeight * imageAspectRatio;
  }

  const inner = (
    <View
      className="bg-popover p-2 pb-6 shadow-lg shadow-foreground/50"
      style={{
        alignSelf: 'center', // Center the polaroid if it's narrower than full width
        transform: [
          {
            rotate: `${getPhotoRotation(photo.uri, photo.width, photo.height)}deg`,
          },
        ],
      }}>
      <Image
        source={{ uri: getFullPhotoUri(photo.uri) }}
        style={{
          width: targetWidth,
          height: targetHeight,
        }}
        resizeMode="contain"
      />
      {/* Remove photo button */}
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={6} className="absolute top-1 right-1 z-10">
          <Badge
            variant="secondary"
            className="h-6 w-6 bg-black/60 border border-white/30 shadow-lg">
            <Icon as={X} className="text-white size-4" strokeWidth={3} />
          </Badge>
        </Pressable>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={{ alignSelf: 'center' }}>
        {inner}
      </Pressable>
    );
  }

  return inner;
}
