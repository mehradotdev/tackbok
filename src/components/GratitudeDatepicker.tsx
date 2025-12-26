import { cn } from '~/lib/utils';
import { format, isAfter, startOfDay } from 'date-fns';
import { Calendar, X } from 'lucide-react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { getGratitudeEntryDatesForMonth } from '~/database';
import { DatePicker, type MarkedDate } from '~/components/ui/datepicker';

// ============================================================================
// Types
// ============================================================================

export interface GratitudeDatepickerProps {
  /** Callback when a date is selected */
  onDateSelect?: (date: Date) => void;
  /** Color for marking dates with entries */
  entryMarkerColor?: string;
  /** FAB className override */
  fabClassName?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function GratitudeDatepicker({
  onDateSelect,
  entryMarkerColor = '#22c55e', // green-500
  fabClassName,
}: GratitudeDatepickerProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonthYear, setCurrentMonthYear] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [existingEntryDates, setExistingEntryDates] = useState<string[]>([]);
  const [today, setToday] = useState(() => startOfDay(new Date()));

  // Fetch entry dates for the current visible month
  useEffect(() => {
    try {
      const entryDates = getGratitudeEntryDatesForMonth(
        currentMonthYear.year,
        currentMonthYear.month,
      );
      setExistingEntryDates(entryDates);
    } catch (error) {
      console.error('Failed to fetch entry dates: ', error);
      setExistingEntryDates([]);
    }
  }, [currentMonthYear]);

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

  const handleOpenModal = useCallback(() => {
    // Recalculate today on modal open to handle apps staying open past midnight
    const freshToday = startOfDay(new Date());
    setToday(freshToday);
    setSelectedDate(freshToday);
    setCurrentMonthYear({
      year: freshToday.getFullYear(),
      month: freshToday.getMonth() + 1,
    });
    setIsModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  const handleDateChange = useCallback(
    (date: Date) => {
      setSelectedDate(date);

      // Trigger callback if provided
      if (onDateSelect) onDateSelect(date);

      // Close modal after selection
      handleCloseModal();
    },
    [onDateSelect, handleCloseModal],
  );

  // Custom day render to handle future dates visually
  const renderDay = useCallback(
    (date: Date, isSelected: boolean, isDisabled: boolean, isCurrentMonth: boolean) => {
      const isFuture = isAfter(startOfDay(date), today);
      const dayNumber = format(date, 'd');
      const dateKey = format(date, 'yyyy-MM-dd');
      const hasEntry = existingEntryDates.includes(dateKey);

      return (
        <View
          className={cn(
            'h-9 w-9 items-center justify-center rounded-full',
            isSelected && !isFuture && 'bg-primary shadow-sm',
            isFuture && 'opacity-30',
          )}>
          <Text
            className={cn(
              'text-base font-medium',
              isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
              isSelected && !isFuture && 'text-primary-foreground',
              isFuture && 'text-muted-foreground',
            )}>
            {dayNumber}
          </Text>
          {hasEntry && !isFuture && (
            <View
              className="absolute bottom-0 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: entryMarkerColor }}
            />
          )}
        </View>
      );
    },
    [today, existingEntryDates, entryMarkerColor],
  );

  return (
    <>
      {/* FAB (Floating Action Button) */}
      <Pressable
        onPress={handleOpenModal}
        className={cn(
          'absolute bottom-6 right-6 z-50',
          'h-14 w-14 items-center justify-center rounded-full',
          'bg-primary shadow-lg shadow-black/25',
          'active:bg-primary/90 active:scale-95',
          fabClassName,
        )}>
        <Calendar size={24} color="white" />
      </Pressable>

      {/* Modal */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
        statusBarTranslucent>
        <Pressable
          onPress={handleCloseModal}
          className="flex-1 items-center justify-center bg-black/50 px-6">
          {/* Modal Content Container - stop propagation */}
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm">
            {/* Header with close button */}
            {/* TODO: Uncomment when design finalized */}
            {/* <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">
                Select Date
              </Text>
              <Pressable
                onPress={handleCloseModal}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-white/10"
              >
                <X size={20} color="white" />
              </Pressable>
            </View> */}

            {/* DatePicker */}
            <DatePicker
              value={selectedDate}
              onChange={handleDateChange}
              maxDate={today}
              markedDates={markedDates}
              renderDay={renderDay}
              containerClassName="shadow-xl"
              scrollToBottomYearsView={true}
              onMonthChange={handleMonthChange}
            />

            {/* Legend */}
            {/* <View className="mt-3 flex-row items-center justify-center gap-4">
              <View className="flex-row items-center gap-2">
                <View
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: entryMarkerColor }}
                />
                <Text className="text-sm text-white/80">Has entry</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="bg-primary h-3 w-3 rounded-full" />
                <Text className="text-sm text-white/80">Selected</Text>
              </View>
            </View> */}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default GratitudeDatepicker;
