import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  cloneElement,
  isValidElement,
} from 'react';
import { View } from 'react-native';
import { format, isAfter, startOfDay } from 'date-fns';
import { MODAL_CLOSE_DELAY } from '~/constants';
import { getEntryDatesForMonth } from '~/db/queries';
import { cn } from '~/lib/utils';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { DatePicker, type MarkedDate } from '~/components/ui/datepicker';

// ============================================================================
// Types
// ============================================================================

export interface IGratitudeDatepickerModalProps {
  /** Component to trigger the modal (must accept onPress) */
  children: React.ReactNode;
  /** Color for marking dates with entries */
  entryMarkerColor?: string;
  /** Callback when a date is selected */
  onDateSelect?: (date: Date) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function GratitudeDatepickerModal({
  children,
  entryMarkerColor = '#22c55e', // green-500
  onDateSelect,
}: IGratitudeDatepickerModalProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [existingEntryDates, setExistingEntryDates] = useState<string[]>([]);
  const [currentMonthYear, setCurrentMonthYear] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const firstDayOfWeek = useSettingsStore((state) => state.firstDayOfWeek);

  // Fetch entry dates for the current visible month
  useEffect(() => {
    if (!isDialogOpen) return;
    try {
      const entryDates = getEntryDatesForMonth(
        currentMonthYear.year,
        currentMonthYear.month,
      );
      setExistingEntryDates(entryDates);
    } catch (error) {
      console.error('Failed to fetch entry dates: ', error);
      setExistingEntryDates([]);
    }
  }, [currentMonthYear, isDialogOpen]);

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

  const handleOpenDialog = useCallback(() => {
    // Recalculate today on dialog open to handle apps staying open past midnight
    const freshToday = startOfDay(new Date());
    setToday(freshToday);
    setSelectedDate(freshToday);
    setCurrentMonthYear({
      year: freshToday.getFullYear(),
      month: freshToday.getMonth() + 1,
    });
    setIsDialogOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
  }, []);

  const handleDateChange = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setIsDialogOpen(false);

      // Wait for modal to close before triggering callback otherwise we get a crash on Android
      setTimeout(() => {
        // Trigger callback if provided
        if (onDateSelect) onDateSelect(date);
      }, MODAL_CLOSE_DELAY);
    },
    [onDateSelect],
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
      {/* Trigger Component */}
      {isValidElement(children) &&
        cloneElement(children as React.ReactElement<{ onPress?: () => void }>, {
          onPress: handleOpenDialog,
        })}

      {/* Dialog - controlled separately */}
      <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
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
            onMonthChange={handleMonthChange}
            firstDayOfWeek={firstDayOfWeek}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GratitudeDatepickerModal;
