import { View } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import type { ImportMode } from '~/lib/backupImport';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

interface SettingsImportModeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectMode: (mode: ImportMode) => void;
}

export function SettingsImportModeModal({
  visible,
  onClose,
  onSelectMode,
}: SettingsImportModeModalProps) {
  const { t } = useTranslation();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={visible} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-center">
            {t('backup.chooseImportMode')}
          </DialogTitle>
          <DialogDescription className="text-center leading-5">
            {t('backup.howShouldThisImportHandleEntriesThatAlreadyExistIn')}
          </DialogDescription>
        </DialogHeader>

        <View className="gap-3">
          <Button
            variant="outline"
            className="h-auto py-3 px-4"
            onPress={() => onSelectMode('skip')}>
            <View className="flex-1 items-start">
              <Text className="text-base font-body-medium text-left">
                {t('backup.skipExistingEntriesRecommended')}
              </Text>
              <Text className="text-sm text-foreground/70 text-left mt-1">
                {t('backup.onlyImportEntriesWithNewNoteIds')}
              </Text>
            </View>
          </Button>

          <Button
            variant="destructive"
            className="h-auto py-3 px-4"
            onPress={() => onSelectMode('overwrite')}>
            <View className="flex-1 items-start">
              <Text className="text-base font-body-medium text-left text-destructive-foreground">
                {t('backup.overwriteMatchingEntries')}
              </Text>
              <Text className="text-sm text-destructive-foreground/80 text-left mt-1">
                {t('backup.replaceExistingEntriesWhenNoteIdsMatch')}
              </Text>
            </View>
          </Button>
        </View>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" className="mt-1" onPress={onClose}>
            <Text>{t('common.cancel')}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
