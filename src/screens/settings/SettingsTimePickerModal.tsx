import { useState } from 'react';
import { View, Modal, Pressable, ScrollView } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';

interface SettingsTimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  value: string; // HH:MM format
  onValueChange: (time: string) => void;
}

// TODO: Implement actual time picker functionality and connect to notifications
export function SettingsTimePickerModal({
  visible,
  onClose,
  value,
  onValueChange,
}: SettingsTimePickerModalProps) {
  const { t } = useTranslation();

  // Parse HH:MM
  const [hours, minutes] = value.split(':').map(Number);
  const [tempHours, setTempHours] = useState(hours);
  const [tempMinutes, setTempMinutes] = useState(minutes);

  const handleConfirm = () => {
    const hh = tempHours.toString().padStart(2, '0');
    const mm = tempMinutes.toString().padStart(2, '0');
    onValueChange(`${hh}:${mm}`);
    onClose();
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50 justify-center items-center"
        onPress={onClose}>
        <Pressable
          className="bg-background rounded-lg p-6 mx-4 w-[90%] max-w-sm"
          onPress={(e) => e.stopPropagation()}>
          <Text className="text-lg font-semibold text-foreground mb-4 text-center">
            {t('Adjust Reminder Time')}
          </Text>

          <View className="flex-row justify-center items-center mb-6">
            {/* Hours Picker */}
            <ScrollView
              className="h-32 w-16"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 48 }}>
              {hourOptions.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setTempHours(h)}
                  className={`py-2 items-center ${tempHours === h ? 'bg-primary/20 rounded' : ''}`}>
                  <Text
                    className={`text-lg ${tempHours === h ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                    {h.toString().padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text className="text-2xl text-foreground px-2">:</Text>

            {/* Minutes Picker */}
            <ScrollView
              className="h-32 w-16"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 48 }}>
              {minuteOptions.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setTempMinutes(m)}
                  className={`py-2 items-center ${tempMinutes === m ? 'bg-primary/20 rounded' : ''}`}>
                  <Text
                    className={`text-lg ${tempMinutes === m ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                    {m.toString().padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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
