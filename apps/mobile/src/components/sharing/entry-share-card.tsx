import React from 'react';
import { Image, Text, View } from 'react-native';
import type { Asset } from '~/types';
import { getFullPhotoUri } from '~/lib/photoUtils';
import {
  ENTRY_LAYOUT_CANDIDATES,
  getFinalBodyLineLimit,
  SHARE_OUTPUTS,
  type ShareOutput,
} from '~/lib/sharing/share-layouts';
import type { SharePalette } from '~/lib/sharing/share-palettes';
import { ShareCardFrame } from './share-card-frame';

/** Privacy cap: the strip never shows more of the entry's gallery than this. */
const MAX_SHARED_PHOTOS = 5;
const PHOTO_GAP = 8;

type EntryShareCardProps = {
  dateLabel: string;
  title: string | null;
  body: string | null;
  moodLabel?: string | null;
  moodEmoji?: string | null;
  photos?: Asset[];
  includeMood: boolean;
  includePhotos: boolean;
  isRTL: boolean;
  palette: SharePalette;
  onReadyChange: (ready: boolean) => void;
  onOutputChange: (output: ShareOutput) => void;
};

export const EntryShareCard = React.forwardRef<View, EntryShareCardProps>(
  function EntryShareCard(
    {
      dateLabel,
      title,
      body,
      moodLabel,
      moodEmoji,
      photos = [],
      includeMood,
      includePhotos,
      isRTL,
      palette,
      onReadyChange,
      onOutputChange,
    },
    ref,
  ) {
    const selectedPhotos = React.useMemo(
      () => photos.slice(0, MAX_SHARED_PHOTOS),
      [photos],
    );
    const photoSourceKey = selectedPhotos.map((photo) => photo.uri).join('|');
    const [candidateIndex, setCandidateIndex] = React.useState(0);
    const [measurementToken, setMeasurementToken] = React.useState(0);
    const [frame, setFrame] = React.useState({ width: 0, height: 0, aspectRatio: 0 });
    const [contentHeight, setContentHeight] = React.useState(0);
    const [loadedPhotos, setLoadedPhotos] = React.useState<Set<string>>(new Set());
    const [failedPhotos, setFailedPhotos] = React.useState<Set<string>>(new Set());

    const candidate = ENTRY_LAYOUT_CANDIDATES[candidateIndex]!;
    const output = SHARE_OUTPUTS[candidate.outputId];
    const visiblePhotos = selectedPhotos.filter((photo) => !failedPhotos.has(photo.uri));
    const photoLoadsSettled =
      !includePhotos ||
      selectedPhotos.every(
        (photo) => loadedPhotos.has(photo.uri) || failedPhotos.has(photo.uri),
      );

    // A candidate step that changes the canvas also changes the frame height, so
    // only trust a frame measurement taken at the aspect ratio being rendered.
    // Otherwise the new content can be compared against the previous, shorter
    // container and skip a fitting candidate.
    const availableHeight = frame.aspectRatio === output.aspectRatio ? frame.height : 0;

    // Everything that can change what has to be measured. `palette` is
    // deliberately absent: colors never affect layout, so a palette change must
    // not discard a valid measurement — `onLayout` would stay silent afterwards
    // and the card would never report ready again.
    React.useEffect(() => {
      setCandidateIndex(0);
      setContentHeight(0);
      // Bumping the token remounts the measured view, which guarantees a fresh
      // `onLayout` even when the new content happens to be exactly as tall.
      setMeasurementToken((token) => token + 1);
      onReadyChange(false);
    }, [
      dateLabel,
      title,
      body,
      moodLabel,
      moodEmoji,
      includeMood,
      includePhotos,
      photoSourceKey,
      failedPhotos.size,
      onReadyChange,
    ]);

    React.useEffect(() => {
      onOutputChange(output);
    }, [onOutputChange, output]);

    const overflows = availableHeight > 0 && contentHeight > availableHeight + 1;

    React.useEffect(() => {
      if (
        overflows &&
        !candidate.finalFallback &&
        candidateIndex < ENTRY_LAYOUT_CANDIDATES.length - 1
      ) {
        onReadyChange(false);
        setCandidateIndex((index) => index + 1);
        setContentHeight(0);
      }
    }, [candidate.finalFallback, candidateIndex, onReadyChange, overflows]);

    React.useEffect(() => {
      if (
        availableHeight <= 0 ||
        contentHeight <= 0 ||
        !photoLoadsSettled ||
        (overflows && !candidate.finalFallback)
      ) {
        onReadyChange(false);
        return;
      }

      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => onReadyChange(true));
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        if (secondFrame) cancelAnimationFrame(secondFrame);
      };
    }, [
      availableHeight,
      candidate.finalFallback,
      candidateIndex,
      contentHeight,
      onReadyChange,
      overflows,
      photoLoadsSettled,
    ]);

    const thumbnailSize = Math.max(
      30,
      Math.min(
        58,
        (frame.width - PHOTO_GAP * (MAX_SHARED_PHOTOS - 1)) / MAX_SHARED_PHOTOS,
      ),
    );
    const fixedTextAlign = isRTL ? 'right' : 'left';
    const finalBodyLineLimit = getFinalBodyLineLimit({ includeMood, includePhotos });

    return (
      <ShareCardFrame ref={ref} palette={palette} aspectRatio={output.aspectRatio}>
        <View
          // Remounting on a canvas change drops any layout event still queued
          // for the previous, differently sized frame.
          key={candidate.outputId}
          style={{ flex: 1, overflow: 'hidden' }}
          onLayout={(event) =>
            setFrame({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
              aspectRatio: output.aspectRatio,
            })
          }>
          <View
            key={`${measurementToken}-${candidateIndex}`}
            onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
            style={{ gap: candidate.contentGap }}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={{
                color: palette.foreground,
                fontFamily: 'Figtree_700Bold',
                fontSize: candidate.dateSize,
                textAlign: fixedTextAlign,
              }}>
              {dateLabel}
            </Text>

            {includeMood && moodLabel && moodEmoji ? (
              <View
                style={{
                  alignSelf: isRTL ? 'flex-end' : 'flex-start',
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  borderColor: palette.border,
                  borderWidth: 1,
                  backgroundColor: palette.accent,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}>
                <Text allowFontScaling={false} style={{ fontSize: 16 }}>
                  {moodEmoji}
                </Text>
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={{
                    color: palette.foreground,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 12,
                    textAlign: fixedTextAlign,
                  }}>
                  {moodLabel}
                </Text>
              </View>
            ) : null}

            {title ? (
              <Text
                allowFontScaling={false}
                numberOfLines={candidate.finalFallback ? 3 : undefined}
                ellipsizeMode="tail"
                style={{
                  color: palette.foreground,
                  fontFamily: 'Figtree_700Bold',
                  fontSize: candidate.titleSize,
                  lineHeight: candidate.titleSize + 5,
                  textAlign: 'auto',
                  writingDirection: 'auto',
                }}>
                {title.trim()}
              </Text>
            ) : null}

            <View style={{ height: 2, backgroundColor: palette.border }} />

            {body ? (
              <Text
                allowFontScaling={false}
                numberOfLines={candidate.finalFallback ? finalBodyLineLimit : undefined}
                ellipsizeMode="tail"
                style={{
                  color: palette.foreground,
                  fontFamily: 'Inter_400Regular',
                  fontSize: candidate.bodySize,
                  lineHeight: candidate.lineHeight,
                  textAlign: 'auto',
                  writingDirection: 'auto',
                }}>
                {body.trim()}
              </Text>
            ) : null}

            {includePhotos && visiblePhotos.length > 0 ? (
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  gap: PHOTO_GAP,
                  alignSelf: isRTL ? 'flex-end' : 'flex-start',
                }}>
                {visiblePhotos.map((photo) => (
                  <Image
                    key={photo.uri}
                    source={{ uri: getFullPhotoUri(photo.uri) }}
                    resizeMode="cover"
                    onLoad={() =>
                      setLoadedPhotos((current) => {
                        const next = new Set(current);
                        next.add(photo.uri);
                        return next;
                      })
                    }
                    onError={() =>
                      setFailedPhotos((current) => {
                        const next = new Set(current);
                        next.add(photo.uri);
                        return next;
                      })
                    }
                    style={{
                      width: thumbnailSize,
                      height: thumbnailSize,
                      borderRadius: 7,
                      borderWidth: 1,
                      borderColor: palette.border,
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </ShareCardFrame>
    );
  },
);
