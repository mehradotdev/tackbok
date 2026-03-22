import { useState, useCallback } from 'react';
import { View, ViewProps, Keyboard } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { format, startOfDay, subDays } from 'date-fns';
import { cn } from 'tailwind-variants';
import { MONTH_SHORT_KEYS } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { Icon } from '~/components/ui/icon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  type Option,
} from '~/components/ui/select';
import { GratitudeDatepickerModal } from '~/components/GratitudeDatepickerModal';
import { Text } from '~/components/ui/text';

// ============================================================================
// Types
// ============================================================================

interface IDateSelectDropdownProps {
  timestamp: number;
  onDateChange: (newTimestamp: number) => void;
  dateLabel: string;
  timeLabel: string;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatShortDate(date: Date, t: (key: string) => string): string {
  const day = format(date, 'd');
  const month = t(MONTH_SHORT_KEYS[date.getMonth()]);
  const year = format(date, 'yyyy');
  return `${day} ${month}, ${year}`;
}

// ============================================================================
// Component
// ============================================================================

export function DateSelectDropdown({
  timestamp,
  onDateChange,
  dateLabel,
  timeLabel,
  className,
  ...props
}: IDateSelectDropdownProps & ViewProps) {
  const { t } = useTranslation();
  const [showDatepicker, setShowDatepicker] = useState(false);

  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);

  // Format options for display
  const todayLabel = `${t('Today')} - ${formatShortDate(today, t)}`;
  const yesterdayLabel = `${t('Yesterday')} - ${formatShortDate(yesterday, t)}`;

  const handleValueChange = useCallback(
    (option: Option | undefined) => {
      if (!option) return;

      if (option.value === 'today') {
        // Preserve time when changing date
        const currentDate = new Date(timestamp);
        const newDate = new Date(today);
        newDate.setHours(
          currentDate.getHours(),
          currentDate.getMinutes(),
          currentDate.getSeconds(),
          currentDate.getMilliseconds(),
        );
        onDateChange(newDate.getTime());
      } else if (option.value === 'yesterday') {
        const currentDate = new Date(timestamp);
        const newDate = new Date(yesterday);
        newDate.setHours(
          currentDate.getHours(),
          currentDate.getMinutes(),
          currentDate.getSeconds(),
          currentDate.getMilliseconds(),
        );
        onDateChange(newDate.getTime());
      } else if (option.value === 'pick') {
        Keyboard.dismiss();
        setShowDatepicker(true);
      }
    },
    [timestamp, today, yesterday, onDateChange],
  );

  const handleDatepickerSelect = useCallback(
    (date: Date) => {
      const currentDate = new Date(timestamp);
      date.setHours(
        currentDate.getHours(),
        currentDate.getMinutes(),
        currentDate.getSeconds(),
        currentDate.getMilliseconds(),
      );
      onDateChange(date.getTime());
    },
    [timestamp, onDateChange],
  );

  return (
    <View className={cn('', className)} {...props}>
      {/* Manually set value to empty to disable highlighting of selected option */}
      <Select value={{ value: '', label: '' }} onValueChange={handleValueChange}>
        <SelectTrigger
          className="bg-transparent border-0 shadow-none h-auto py-0 active:bg-accent"
          triggerIcon={
            // Simple circular button with chevron
            <View className="bg-muted-foreground rounded-full p-0.5">
              <Icon as={ChevronDown} strokeWidth={5} className="text-background size-3" />
            </View>
          }
          size="flex">
          {/* Date/Time display */}
          <View className="flex-col items-center">
            <Text className="font-bold text-lg text-foreground">{dateLabel}</Text>
            <Text className="text-sm text-foreground/80">{timeLabel}</Text>
          </View>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today" label={todayLabel} />
          <SelectItem value="yesterday" label={yesterdayLabel} />
          <SelectSeparator />
          <SelectItem value="pick" label={t('Pick any date')} />
        </SelectContent>
      </Select>

      {/* Datepicker Modal */}
      <GratitudeDatepickerModal
        visible={showDatepicker}
        onClose={() => setShowDatepicker(false)}
        onDateSelect={handleDatepickerSelect}
      />
    </View>
  );
}
