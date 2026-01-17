import { useState, useEffect } from 'react';
import { View, Modal, Pressable } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Label } from '~/components/ui/label';

type BackupFrequencyOption = 'daily' | 'weekly' | 'on_change';

interface SettingsBackupFrequencyModalProps {
  visible: boolean;
  onClose: () => void;
  value: BackupFrequencyOption;
  onValueChange: (frequency: BackupFrequencyOption) => void;
}

// TODO: Implement actual Google Drive backup functionality
export function SettingsBackupFrequencyModal({
  visible,
  onClose,
  value,
  onValueChange,
}: SettingsBackupFrequencyModalProps) {
  const { t } = useTranslation();
  const [tempValue, setTempValue] = useState<BackupFrequencyOption>(value);

  // Sync local state when modal opens
  useEffect(() => {
    if (visible) {
      setTempValue(value);
    }
  }, [visible, value]);

  const options: { value: BackupFrequencyOption; label: string }[] = [
    { value: 'daily', label: t('Daily') },
    { value: 'weekly', label: t('Weekly') },
    { value: 'on_change', label: t('On Every Change') },
  ];

  const handleConfirm = () => {
    onValueChange(tempValue);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50 justify-center items-center"
        onPress={onClose}>
        <Pressable
          className="bg-background rounded-lg p-6 mx-4 w-[90%] max-w-sm"
          onPress={(e) => e.stopPropagation()}>
          <Text className="text-lg font-semibold text-foreground mb-4 text-center">
            {t('Backup Frequency')}
          </Text>

          <RadioGroup
            value={tempValue}
            onValueChange={(val) => setTempValue(val as BackupFrequencyOption)}
            className="mb-6 gap-0">
            {options.map((option) => (
              <View key={option.value} className="flex-row items-center py-3 gap-3">
                <RadioGroupItem
                  value={option.value}
                  aria-labelledby={`label-${option.value}`}
                />
                <Label
                  nativeID={`label-${option.value}`}
                  onPress={() => setTempValue(option.value)}
                  className="text-base text-foreground font-normal flex-1">
                  {option.label}
                </Label>
              </View>
            ))}
          </RadioGroup>

          <View className="flex-row gap-3">
            <Button variant="outline" className="flex-1" onPress={onClose}>
              <Text>{t('Cancel')}</Text>
            </Button>
            <Button className="flex-1" onPress={handleConfirm}>
              <Text>{t('Done')}</Text>
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
