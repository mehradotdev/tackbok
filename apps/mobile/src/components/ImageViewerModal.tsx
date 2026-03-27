import React, { useRef, useEffect, useState } from 'react';
import {
  Modal,
  View,
  FlatList,
  useWindowDimensions,
  Pressable,
  StatusBar,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { ZoomableImage } from './ZoomableImage';

// Define a generic interface for photos to make the component modular
export interface ImageViewerPhoto {
  uri: string;
  width?: number;
  height?: number;
}

interface ImageViewerModalProps {
  visible: boolean;
  initialIndex?: number;
  photos: ImageViewerPhoto[];
  onClose: () => void;
}

export function ImageViewerModal({
  visible,
  initialIndex = 0,
  photos,
  onClose,
}: ImageViewerModalProps) {
  const flatListRef = useRef<FlatList>(null);

  const [isScrollEnabled, setScrollEnabled] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, photos.length - 1)),
  );
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Use full screen dimensions for full bleed
  const itemWidth = windowWidth;
  const itemHeight = windowHeight;

  // Scroll to initial index when visible changes or component mounts
  useEffect(() => {
    if (visible && photos.length > 0) {
      const safeIndex = Math.max(0, Math.min(initialIndex, photos.length - 1));
      setCurrentIndex(safeIndex);
      // Use a small timeout to ensure FlatList is ready
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: safeIndex,
          animated: false,
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, initialIndex, photos.length]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      backdropColor="black"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}>
      <GestureHandlerRootView className="flex-1 bg-black">
        <StatusBar barStyle="light-content" hidden />

        {visible && (
          <View className="flex-1 relative">
            {/* Main Carousel */}
            <FlatList
              ref={flatListRef}
              data={photos}
              horizontal
              pagingEnabled
              // Force re-render on orientation change so getItemLayout uses correct dimensions
              key={itemWidth}
              scrollEnabled={isScrollEnabled}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => `${item.uri}-${index}`}
              getItemLayout={(_, index) => ({
                length: itemWidth,
                offset: itemWidth * index,
                index,
              })}
              initialScrollIndex={currentIndex}
              onMomentumScrollEnd={(ev) => {
                const newIndex = Math.round(ev.nativeEvent.contentOffset.x / itemWidth);
                setCurrentIndex(newIndex);
              }}
              // If scroll-to-index fails for any reason, fall back to the first photo
              onScrollToIndexFailed={() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                setCurrentIndex(0);
              }}
              renderItem={({ item }) => {
                return (
                  <View style={{ width: itemWidth, height: itemHeight }}>
                    <ZoomableImage
                      uri={item.uri}
                      width={item.width}
                      height={item.height}
                      containerWidth={itemWidth}
                      containerHeight={itemHeight}
                      onZoomChange={(isZoomed) => setScrollEnabled(!isZoomed)}
                      onClose={onClose}
                    />
                  </View>
                );
              }}
            />

            {/* Close Button - Positioned absolutely within the Safe Area */}
            <View className="absolute top-safe-or-2 right-safe-or-2 z-10">
              <Pressable
                onPress={onClose}
                className="w-11 h-11 rounded-full bg-black/50 justify-center items-center active:bg-white/20">
                <Icon as={X} className="text-white size-7" />
              </Pressable>
            </View>

            {/* Image Counter Pill - Positioned absolutely at bottom center */}
            <View
              className="absolute left-0 right-0 bottom-safe-or-6 z-10 items-center justify-center"
              pointerEvents="box-none">
              <View className="bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">
                <Text className="text-white font-body-bold">
                  {currentIndex + 1} / {photos.length}
                </Text>
              </View>
            </View>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}
