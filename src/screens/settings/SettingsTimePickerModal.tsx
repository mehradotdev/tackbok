import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Modal, Pressable } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list';

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

  const hoursListRef = useRef<LegendListRef>(null);
  const minutesListRef = useRef<LegendListRef>(null);

  useEffect(() => {
    if (visible) {
      // Reset non-saved values when modal opens
      setTempHours(hours);
      setTempMinutes(minutes);

      // Delay scrolling to ensure list is ready
      setTimeout(() => {
        hoursListRef.current?.scrollToIndex({
          index: hours,
          animated: true,
          viewPosition: 0.5,
        });
        minutesListRef.current?.scrollToIndex({
          index: minutes,
          animated: true,
          viewPosition: 0.5,
        });
      }, 200);
    }
  }, [visible, hours, minutes]);

  const handleConfirm = () => {
    const hh = tempHours.toString().padStart(2, '0');
    const mm = tempMinutes.toString().padStart(2, '0');
    onValueChange(`${hh}:${mm}`);
    onClose();
  };

  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const renderHourItem = ({ item }: LegendListRenderItemProps<number>) => {
    const isSelected = item === tempHours;
    return (
      <Pressable
        onPress={() => {
          setTempHours(item);
          hoursListRef.current?.scrollToIndex({
            index: item,
            animated: true,
            viewPosition: 0.5,
          });
        }}
        className={`h-10 justify-center items-center ${isSelected ? 'bg-primary/20 rounded' : ''}`}>
        <Text
          className={`text-lg ${isSelected ? 'text-primary font-bold' : 'text-foreground/80'}`}>
          {item.toString().padStart(2, '0')}
        </Text>
      </Pressable>
    );
  };

  const renderMinuteItem = ({ item }: LegendListRenderItemProps<number>) => {
    const isSelected = item === tempMinutes;
    return (
      <Pressable
        onPress={() => {
          setTempMinutes(item);
          minutesListRef.current?.scrollToIndex({
            index: item,
            animated: true,
            viewPosition: 0.5,
          });
        }}
        className={`h-10 justify-center items-center ${isSelected ? 'bg-primary/20 rounded' : ''}`}>
        <Text
          className={`text-lg ${isSelected ? 'text-primary font-bold' : 'text-foreground/80'}`}>
          {item.toString().padStart(2, '0')}
        </Text>
      </Pressable>
    );
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
            {t('Adjust Reminder Time')}
          </Text>

          <View className="flex-row justify-center items-center mb-6">
            {/* Hours Picker */}
            <View className="h-32 w-16">
              <LegendList
                data={hourOptions}
                estimatedItemSize={40}
                extraData={tempHours}
                keyExtractor={(item) => item.toString()}
                ref={hoursListRef}
                renderItem={renderHourItem}
                contentContainerStyle={{ paddingVertical: 48 }}
                showsVerticalScrollIndicator={false}
              />
            </View>

            <Text className="text-2xl text-foreground px-2">:</Text>

            {/* Minutes Picker */}
            <View className="h-32 w-16">
              <LegendList
                data={minuteOptions}
                estimatedItemSize={40}
                extraData={tempMinutes}
                keyExtractor={(item) => item.toString()}
                ref={minutesListRef}
                renderItem={renderMinuteItem}
                contentContainerStyle={{ paddingVertical: 48 }}
                showsVerticalScrollIndicator={false}
              />
            </View>
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
