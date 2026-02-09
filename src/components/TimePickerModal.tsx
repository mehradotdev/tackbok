import { useState, useRef, useMemo, useEffect } from 'react';
import { View } from 'react-native';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '~/components/ui/dialog';

interface TimePickerModalProps {
  value: string; // HH:MM format
  onValueChange: (time: string) => void;
  title?: string;
  visible: boolean;
  onClose: () => void;
}

export function TimePickerModal({
  value,
  onValueChange,
  title,
  visible,
  onClose,
}: TimePickerModalProps) {
  const { t } = useTranslation();

  // Parse HH:MM
  const [hours, minutes] = value.split(':').map((v) => Number(v) || 0);
  const [tempHours, setTempHours] = useState(hours);
  const [tempMinutes, setTempMinutes] = useState(minutes);

  const hoursListRef = useRef<LegendListRef>(null);
  const minutesListRef = useRef<LegendListRef>(null);

  useEffect(() => {
    if (visible) {
      // Reset non-saved values when modal opens
      setTempHours(hours);
      setTempMinutes(minutes);

      // Delay scrolling to ensure list is ready and layout is complete
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

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      onClose();
    }
  };

  const handleConfirm = () => {
    const hh = tempHours.toString().padStart(2, '0');
    const mm = tempMinutes.toString().padStart(2, '0');
    onValueChange(`${hh}:${mm}`);
    handleOpenChange(false);
  };

  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const renderHourItem = ({ item }: LegendListRenderItemProps<number>) => {
    const isSelected = item === tempHours;
    return (
      <Button
        variant="ghost"
        size="flex"
        onPress={() => {
          setTempHours(item);
          hoursListRef.current?.scrollToIndex({
            index: item,
            animated: true,
            viewPosition: 0.5,
          });
        }}
        className={`h-10 justify-center items-center ${isSelected ? 'bg-primary/60' : ''}`}>
        <Text
          className={`text-lg ${isSelected ? 'text-primary-foreground/80 font-bold' : 'text-foreground/80'}`}>
          {item.toString().padStart(2, '0')}
        </Text>
      </Button>
    );
  };

  const renderMinuteItem = ({ item }: LegendListRenderItemProps<number>) => {
    const isSelected = item === tempMinutes;
    return (
      <Button
        variant="ghost"
        size="flex"
        onPress={() => {
          setTempMinutes(item);
          minutesListRef.current?.scrollToIndex({
            index: item,
            animated: true,
            viewPosition: 0.5,
          });
        }}
        className={`h-10 justify-center items-center ${isSelected ? 'bg-primary/60' : ''}`}>
        <Text
          className={`text-lg ${isSelected ? 'text-primary-foreground/80 font-bold' : 'text-foreground/80'}`}>
          {item.toString().padStart(2, '0')}
        </Text>
      </Button>
    );
  };

  return (
    <Dialog open={visible} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[320px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-center">{title || t('Select Time')}</DialogTitle>
        </DialogHeader>

        <View className="flex-row justify-center items-center my-4">
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

        <DialogFooter className="flex-row gap-2 sm:justify-center">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => handleOpenChange(false)}>
            <Text>{t('Cancel')}</Text>
          </Button>
          <Button className="flex-1" onPress={handleConfirm}>
            <Text>{t('Done')}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
