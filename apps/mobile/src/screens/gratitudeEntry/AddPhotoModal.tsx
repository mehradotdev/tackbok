import React, { useState, useCallback } from 'react';
import { View, Linking } from 'react-native';
import { Camera, ImagePlus } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { cn } from 'tailwind-variants';
import { MAX_PHOTOS_PER_ENTRY } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { pickPhotos, type PickPhotosResult } from '~/lib/photoUtils';
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
  onPhotosPicked: (result: PickPhotosResult) => void;
  currentPhotoCount: number;
}

export function AddPhotoModal({
  visible,
  onClose,
  onPhotosPicked,
  currentPhotoCount,
}: IAddPhotoModalProps) {
  const { t } = useTranslation();
  const [themeRadiusStr] = useCSSVariable(['--theme-radius']);
  const isSharp = String(themeRadiusStr) === '0';

  const [permissionAlert, setPermissionAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

  /** Show an alert guiding the user to enable permissions in device Settings. */
  const showPermissionDeniedAlert = useCallback(
    (source: 'camera' | 'library') => {
      onClose(); // Close the choice dialog first
      const title =
        source === 'camera'
          ? t('Camera Access Required')
          : t('Photo Library Access Required');
      const message =
        source === 'camera'
          ? t('Please enable camera access in your device settings to take photos.')
          : t(
              'Please enable photo library access in your device settings to select photos.',
            );

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

  return (
    <>
      <Dialog open={visible} onOpenChange={onClose}>
        <DialogContent className={isSharp ? 'rounded-none' : ''}>
          <DialogHeader>
            <DialogTitle>{t('Add Photo')}</DialogTitle>
          </DialogHeader>
          <View className="flex-row gap-4 justify-center py-4">
            <Button
              variant="outline"
              className={cn(
                'flex-1 bg-card aspect-square flex-col justify-center items-center gap-2 h-auto',
                isSharp && 'rounded-none',
              )}
              onPress={async () => {
                onClose();
                const result = await pickPhotos('camera', 1);
                await handlePickResult(result);
              }}>
              <Icon as={Camera} className="size-8 text-foreground" strokeWidth={2} />
              <Text className="text-center font-body-medium">{t('Take Photo')}</Text>
            </Button>
            <Button
              variant="outline"
              className={cn(
                'flex-1 bg-card aspect-square flex-col justify-center items-center gap-2 h-auto',
                isSharp && 'rounded-none',
              )}
              onPress={async () => {
                onClose();
                const remaining = MAX_PHOTOS_PER_ENTRY - currentPhotoCount;
                if (remaining <= 0) return;
                const result = await pickPhotos('library', remaining);
                await handlePickResult(result);
              }}>
              <Icon as={ImagePlus} className="size-8 text-foreground" strokeWidth={2} />
              <Text className="text-center font-body-medium">
                {t('Choose from Library')}
              </Text>
            </Button>
          </View>
          <DialogFooter>
            <Button variant="default" className="w-full" onPress={onClose}>
              <Text>{t('Cancel')}</Text>
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
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setPermissionAlert((prev) => ({ ...prev, isOpen: false }));
                Linking.openSettings();
              }}>
              <Text>{t('Open Settings')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
