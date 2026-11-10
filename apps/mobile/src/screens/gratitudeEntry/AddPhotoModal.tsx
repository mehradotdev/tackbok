import React, { useState, useCallback, useEffect } from 'react';
import { View, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Camera, ClipboardPaste, ImagePlus } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { cn } from 'tailwind-variants';
import { MAX_PHOTOS_PER_ENTRY } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { pickPhotos, type PickPhotosResult } from '~/lib/photoUtils';
import {
  CLIPBOARD_IMAGE_OPTIONS,
  addImageFromDataUri,
  readClipboardImageDataUri,
} from '~/lib/clipboardPhoto';
import { toast } from '~/components/ui/toast';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

interface IAddPhotoModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotosPicked: (result: PickPhotosResult) => void | Promise<void>;
  currentPhotoCount: number;
}

// Apple's UIPasteControl (iOS 16+) pastes without the "Allow Paste" prompt.
const usesSystemPasteButton = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;

export function AddPhotoModal({
  visible,
  onClose,
  onPhotosPicked,
  currentPhotoCount,
}: IAddPhotoModalProps) {
  const { t } = useTranslation();
  const [themeRadiusStr, cardColor, foregroundColor] = useCSSVariable([
    '--theme-radius',
    '--color-card',
    '--color-foreground',
  ]);
  const isSharp = String(themeRadiusStr) === '0';

  const [permissionAlert, setPermissionAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

  // Type check only; the clipboard content is read after the user taps paste.
  const [clipboardHasImage, setClipboardHasImage] = useState(false);
  useEffect(() => {
    if (!visible || usesSystemPasteButton) return;
    let isCurrent = true;
    Clipboard.hasImageAsync()
      .catch(() => false)
      .then((hasImage) => {
        if (isCurrent) setClipboardHasImage(hasImage);
      });
    return () => {
      isCurrent = false;
    };
  }, [visible]);

  const photoActionButtonClass = cn(
    'flex-1 bg-card aspect-square flex-col justify-center items-center gap-2 h-auto',
    isSharp && 'rounded-none',
  );

  /** Show an alert guiding the user to enable permissions in device Settings. */
  const showPermissionDeniedAlert = useCallback(
    (source: 'camera' | 'library') => {
      onClose(); // Close the choice dialog first
      const title =
        source === 'camera'
          ? t('entry.cameraAccessRequired')
          : t('entry.photoLibraryAccessRequired');
      const message =
        source === 'camera'
          ? t('entry.pleaseEnableCameraAccessInYourDeviceSettingsToTake')
          : t('entry.pleaseEnablePhotoLibraryAccessInYourDeviceSettingsTo');

      setPermissionAlert({ isOpen: true, title, message });
    },
    [t, onClose],
  );

  /** Process the result from pickPhotos — adds photos on success, shows alert on denial. */
  const handlePickResult = useCallback(
    async (result: PickPhotosResult) => {
      if (result.status === 'denied') {
        showPermissionDeniedAlert(result.source);
        return;
      }
      if (result.status === 'cancelled') return;
      if (result.uris.length === 0) return;

      onClose();
      onPhotosPicked(result);
    },
    [showPermissionDeniedAlert, onPhotosPicked, onClose],
  );

  /**
   * Add a pasted data URI through the regular photo path, or explain why not.
   * The dialog stays open until the image is handed to `onPhotosPicked`, so the
   * editor can't be saved or closed while the clipboard is still being read.
   */
  const [isPasting, setIsPasting] = useState(false);
  const pasteImage = useCallback(
    async (readDataUri: () => Promise<string | null>) => {
      setIsPasting(true);
      try {
        const result = await addImageFromDataUri(await readDataUri(), (picked) => {
          onClose();
          return onPhotosPicked(picked);
        });
        if (result === 'no-image') toast.warning(t('entry.clipboardHasNoImage'));
        if (result === 'invalid-image') toast.error(t('entry.clipboardImageInvalid'));
      } catch (error) {
        console.error('Failed to paste photo:', error);
        toast.error(t('entry.clipboardImageInvalid'));
      } finally {
        setIsPasting(false);
        onClose();
      }
    },
    [onClose, onPhotosPicked, t],
  );

  const pasteRowClass = cn(
    'w-full h-auto py-3 bg-card flex-row gap-2',
    isSharp && 'rounded-none',
  );

  return (
    <>
      <Dialog open={visible} onOpenChange={onClose}>
        <DialogContent className={isSharp ? 'rounded-none' : ''}>
          <DialogHeader>
            <DialogTitle>{t('entry.addPhoto')}</DialogTitle>
          </DialogHeader>
          <View className="flex-row gap-4 justify-center py-4">
            <Button
              variant="outline"
              className={photoActionButtonClass}
              onPress={async () => {
                onClose();
                const result = await pickPhotos('camera', 1);
                await handlePickResult(result);
              }}>
              <Icon as={Camera} className="size-8 text-foreground" strokeWidth={2} />
              <Text className="text-center font-body-medium">{t('entry.takePhoto')}</Text>
            </Button>
            <Button
              variant="outline"
              className={photoActionButtonClass}
              onPress={async () => {
                onClose();
                const remaining = MAX_PHOTOS_PER_ENTRY - currentPhotoCount;
                if (remaining <= 0) return;
                const result = await pickPhotos('library', remaining);
                await handlePickResult(result);
              }}>
              <Icon as={ImagePlus} className="size-8 text-foreground" strokeWidth={2} />
              <Text className="text-center font-body-medium">
                {t('entry.chooseFromLibrary')}
              </Text>
            </Button>
          </View>
          {usesSystemPasteButton ? (
            <View
              className={cn(
                'w-full h-12 border-theme bg-card shadow-theme rounded-md',
                isSharp && 'rounded-none',
              )}>
              <Clipboard.ClipboardPasteButton
                acceptedContentTypes={['image']}
                imageOptions={CLIPBOARD_IMAGE_OPTIONS}
                displayMode="iconAndLabel"
                // UIPasteControl has no square corner style; 'small' is the closest.
                cornerStyle={isSharp ? 'small' : 'medium'}
                backgroundColor={typeof cardColor === 'string' ? cardColor : null}
                foregroundColor={
                  typeof foregroundColor === 'string' ? foregroundColor : null
                }
                style={{ flex: 1 }}
                onPress={(event) => {
                  void pasteImage(async () =>
                    event.type === 'image' ? event.data : null,
                  );
                }}
              />
            </View>
          ) : (
            <Button
              variant="outline"
              className={pasteRowClass}
              disabled={!clipboardHasImage || isPasting}
              onPress={() => pasteImage(readClipboardImageDataUri)}>
              <Icon
                as={ClipboardPaste}
                className="size-5 text-foreground"
                strokeWidth={2}
              />
              <Text className="shrink text-center font-body-medium">
                {t('entry.pasteFromClipboard')}
              </Text>
            </Button>
          )}
          <DialogFooter>
            <Button variant="default" className="w-full" onPress={onClose}>
              <Text>{t('common.cancel')}</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={permissionAlert.isOpen}
        onOpenChange={(isOpen) => setPermissionAlert((prev) => ({ ...prev, isOpen }))}>
        <AlertDialogContent className={isSharp ? 'rounded-none' : ''}>
          <AlertDialogHeader>
            <AlertDialogTitle>{permissionAlert.title}</AlertDialogTitle>
            <AlertDialogDescription>{permissionAlert.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onPress={() => setPermissionAlert((prev) => ({ ...prev, isOpen: false }))}>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setPermissionAlert((prev) => ({ ...prev, isOpen: false }));
                Linking.openSettings();
              }}>
              <Text>{t('entry.openSettings')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
