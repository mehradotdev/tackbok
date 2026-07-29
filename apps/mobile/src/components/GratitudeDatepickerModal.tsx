import { useState, useMemo, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { format, startOfDay } from 'date-fns';
import { cn } from 'tailwind-variants';
import { Shuffle } from 'lucide-react-native';
import { MODAL_CLOSE_DELAY } from '~/constants';
import { useSettingsStore } from '~/lib/settings';
import { useTranslation } from '~/lib/i18n';
import { useEntryDatesForMonth, useEntryCount } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { DatePicker, type MarkedDate } from '~/components/ui/datepicker';

// ============================================================================
// Types
// ============================================================================

export interface IGratitudeDatepickerModalProps {
  /** Color for marking dates with entries */
  entryMarkerColor?: string;
  /** Callback when a date is selected */
  onDateSelect?: (date: Date) => void;
  /** Callback when the Random button is pressed. Button is hidden when absent or when fewer than 2 entries exist */
  onRandomSelect?: () => void;
  /** Controlled visibility state */
  visible: boolean;
  /** Callback when modal closes */
  onClose: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function GratitudeDatepickerModal({
  entryMarkerColor = '#22c55e', // green-500
  onDateSelect,
  onRandomSelect,
  visible,
  onClose,
}: IGratitudeDatepickerModalProps) {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonthYear, setCurrentMonthYear] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const firstDayOfWeek = useSettingsStore((state) => state.firstDayOfWeek);

  const { data: existingEntryDates = [] } = useEntryDatesForMonth(
    currentMonthYear.year,
    currentMonthYear.month,
    visible,
  );
  // "Random" is only meaningful with at least 2 entries to pick between
  const { data: entryCount = 0 } = useEntryCount(visible);
  const showRandomButton = !!onRandomSelect && entryCount >= 2;

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      const freshToday = startOfDay(new Date());
      setToday(freshToday);
      setSelectedDate(freshToday);
      setCurrentMonthYear({
        year: freshToday.getFullYear(),
        month: freshToday.getMonth() + 1,
      });
    }
  }, [visible]);

  // Track when the user navigates to a different month
  const handleMonthChange = useCallback((date: Date) => {
    const newYear = date.getFullYear();
    const newMonth = date.getMonth() + 1; // getMonth() is 0-based
    setCurrentMonthYear({ year: newYear, month: newMonth });
  }, []);

  // Convert entry dates array to markedDates record
  const markedDates = useMemo(() => {
    const marks: Record<string, MarkedDate> = {};
    existingEntryDates.forEach((dateStr) => {
      marks[dateStr] = { color: entryMarkerColor };
    });
    return marks;
  }, [existingEntryDates, entryMarkerColor]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose],
  );

  const handleDateChange = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      // Close the modal immediately, then fire the onDateSelect callback after the
      // close-animation completes to avoid potential crashes/animation issues.
      handleOpenChange(false);

      // Wait for modal to close before triggering callback to avoid potential crashes/animations issues
      setTimeout(() => {
        // Trigger callback if provided
        if (onDateSelect) onDateSelect(date);
      }, MODAL_CLOSE_DELAY);
    },
    [onDateSelect, handleOpenChange],
  );

  const handleRandomPress = useCallback(() => {
    // Close first, then navigate after the close-animation, same as date selection
    handleOpenChange(false);
    setTimeout(() => {
      onRandomSelect?.();
    }, MODAL_CLOSE_DELAY);
  }, [onRandomSelect, handleOpenChange]);

  // Custom day render — uses isDisabled from DatePicker as the single source of truth
  const renderDay = useCallback(
    (date: Date, isSelected: boolean, isDisabled: boolean, isCurrentMonth: boolean) => {
      const dayNumber = format(date, 'd');
      const dateKey = format(date, 'yyyy-MM-dd');
      const hasEntry = existingEntryDates.includes(dateKey);

      return (
        <View
          className={cn(
            'h-9 w-9 items-center justify-center rounded-lg',
            isSelected && !isDisabled && 'bg-primary shadow-sm',
            isDisabled && 'opacity-30',
          )}>
          <Text
            className={cn(
              'text-base font-body-medium',
              isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
              isSelected && !isDisabled && 'text-primary-foreground',
              isDisabled && 'text-muted-foreground',
            )}>
            {dayNumber}
          </Text>
          {hasEntry && !isDisabled && (
            <View
              className="absolute bottom-0 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: entryMarkerColor }}
            />
          )}
        </View>
      );
    },
    [existingEntryDates, entryMarkerColor],
  );

  return (
    <Dialog open={visible} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-sm items-center border-0 bg-transparent p-0 shadow-none">
        <DatePicker
          value={selectedDate}
          onChange={handleDateChange}
          maxDate={today}
          markedDates={markedDates}
          renderDay={renderDay}
          containerClassName="shadow-xl bg-background"
          scrollToBottomYearsView={true}
          onMonthYearChange={handleMonthChange}
          firstDayOfWeek={firstDayOfWeek}
          footer={
            showRandomButton ? (
              <View className="mt-1 flex-row justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleRandomPress}
                  accessibilityLabel={t('Open a random entry')}>
                  <Icon as={Shuffle} size={16} />
                  <Text>{t('Random')}</Text>
                </Button>
              </View>
            ) : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}

export default GratitudeDatepickerModal;
