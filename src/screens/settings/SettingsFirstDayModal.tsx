import { useState } from 'react';
import { View, Modal, Pressable } from 'react-native';
import { Circle, CircleDot } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';

type FirstDayOption = 'saturday' | 'sunday' | 'monday';

interface SettingsFirstDayModalProps {
  visible: boolean;
  onClose: () => void;
  value: FirstDayOption;
  onValueChange: (day: FirstDayOption) => void;
}

// TODO: Implement actual calendar integration
export function SettingsFirstDayModal({
  visible,
  onClose,
  value,
  onValueChange,
}: SettingsFirstDayModalProps) {
  const { t } = useTranslation();
  const [tempValue, setTempValue] = useState(value);

  const options: { value: FirstDayOption; label: string }[] = [
    { value: 'saturday', label: t('Saturday') },
    { value: 'sunday', label: t('Sunday') },
    { value: 'monday', label: t('Monday') },
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
            {t('First Day of Week')}
          </Text>

          <View className="mb-6">
            {options.map((option) => (
              <Pressable
                key={option.value}
                className="flex-row items-center py-3 border-b border-border last:border-b-0"
                onPress={() => setTempValue(option.value)}>
                <Icon
                  as={tempValue === option.value ? CircleDot : Circle}
                  className={`mr-3 size-5 ${tempValue === option.value ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <Text className="text-base text-foreground">{option.label}</Text>
              </Pressable>
            ))}
          </View>

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
