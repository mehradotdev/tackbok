import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isBefore,
  isAfter,
  setMonth,
  setYear,
  getYear,
  getMonth,
} from 'date-fns';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Icon } from '~/components/ui/icon';

// ============================================================================
// Types
// ============================================================================

export interface MarkedDate {
  color?: string;
}

export interface DatePickerProps {
  /** Currently selected date */
  value: Date;
  /** Callback when a date is selected */
  onChange: (date: Date) => void;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Dates to mark with colored dots. Keys should be ISO date strings (YYYY-MM-DD) */
  markedDates?: Record<string, MarkedDate>;
  /** Custom render function for day cells */
  renderDay?: (
    date: Date,
    isSelected: boolean,
    isDisabled: boolean,
    isCurrentMonth: boolean,
  ) => React.ReactNode;
  /** Container className override */
  containerClassName?: string;
  /** Theme accent color (tailwind class like 'bg-primary') */
  themeColor?: string;
  scrollToBottomYearsView?: boolean;
  /** Callback when the visible month changes */
  onMonthChange?: (date: Date) => void;
}

type ViewMode = 'days' | 'months' | 'years';

// Keys for translation - these match the keys in translation files
const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_KEYS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTH_SHORT_KEYS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ============================================================================
// Helper Components
// ============================================================================

interface NavButtonProps {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function NavButton({ onPress, disabled, children }: NavButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={cn(
        'h-10 w-10 items-center justify-center rounded-full',
        'active:bg-foreground/20',
        disabled && 'opacity-30',
      )}>
      {children}
    </Pressable>
  );
}

interface DayCellProps {
  date: Date;
  isSelected: boolean;
  isDisabled: boolean;
  isCurrentMonth: boolean;
  marker?: MarkedDate;
  themeColor: string;
  onPress: () => void;
  renderDay?: DatePickerProps['renderDay'];
}

function DayCell({
  date,
  isSelected,
  isDisabled,
  isCurrentMonth,
  marker,
  themeColor,
  onPress,
  renderDay,
}: DayCellProps) {
  if (renderDay) {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        className="h-11 w-11 items-center justify-center">
        {renderDay(date, isSelected, isDisabled, isCurrentMonth)}
      </Pressable>
    );
  }

  const dayNumber = format(date, 'd');

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full',
        !isDisabled && 'active:bg-muted',
        isDisabled && 'opacity-30',
      )}>
      <View
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full',
          isSelected && themeColor,
          isSelected && 'shadow-sm',
        )}>
        <Text
          className={cn(
            'text-base font-medium',
            isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
            isSelected && 'text-primary-foreground',
          )}>
          {dayNumber}
        </Text>
      </View>
      {marker && (
        <View
          className={cn('absolute bottom-0.5 h-1.5 w-1.5 rounded-full')}
          style={{ backgroundColor: marker.color || '#22c55e' }}
        />
      )}
    </Pressable>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  markedDates = {},
  renderDay,
  containerClassName,
  themeColor = 'bg-primary',
  scrollToBottomYearsView = false,
  onMonthChange,
}: DatePickerProps) {
  const { t, isRTL } = useTranslation();
  const [viewDate, setViewDate] = useState(value);
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const yearsScrollRef = useRef<ScrollView>(null);
  const hasAutoScrolledYearsRef = useRef(false);

  // Generate calendar days for current view month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [viewDate]);

  // Generate years for year selection
  const years = useMemo(() => {
    const thisYear = getYear(new Date());
    const startYear = minDate ? getYear(minDate) : thisYear - 100;
    const endYear = maxDate ? getYear(maxDate) : thisYear + 10;
    const yearsArray: number[] = [];
    for (let year = startYear; year <= endYear; year++) {
      yearsArray.push(year);
    }
    return yearsArray;
  }, [minDate, maxDate]);

  const canGoBack = useMemo(() => {
    if (!minDate) return true;
    const prevMonth = subMonths(viewDate, 1);
    return !isBefore(endOfMonth(prevMonth), minDate);
  }, [viewDate, minDate]);

  const canGoForward = useMemo(() => {
    if (!maxDate) return true;
    const nextMonth = addMonths(viewDate, 1);
    return !isAfter(startOfMonth(nextMonth), maxDate);
  }, [viewDate, maxDate]);

  const handlePrevMonth = useCallback(() => {
    if (canGoBack) {
      setViewDate((prev) => {
        const newDate = subMonths(prev, 1);
        onMonthChange?.(newDate);
        return newDate;
      });
    }
  }, [canGoBack, onMonthChange]);

  const handleNextMonth = useCallback(() => {
    if (canGoForward) {
      setViewDate((prev) => {
        const newDate = addMonths(prev, 1);
        onMonthChange?.(newDate);
        return newDate;
      });
    }
  }, [canGoForward, onMonthChange]);

  const handleDayPress = useCallback(
    (date: Date) => {
      onChange(date);
    },
    [onChange],
  );

  const handleMonthSelect = useCallback(
    (monthIndex: number) => {
      setViewDate((prev) => {
        const newDate = setMonth(prev, monthIndex);
        onMonthChange?.(newDate);
        return newDate;
      });
      setViewMode('days');
    },
    [onMonthChange],
  );

  const handleYearSelect = useCallback((year: number) => {
    setViewDate((prev) => setYear(prev, year));
    setViewMode('months');
  }, []);

  const maybeAutoScrollYearsToBottom = useCallback(() => {
    if (viewMode !== 'years') return;
    if (!scrollToBottomYearsView) return;
    if (hasAutoScrolledYearsRef.current) return;

    requestAnimationFrame(() => {
      yearsScrollRef.current?.scrollToEnd({ animated: false });
      hasAutoScrolledYearsRef.current = true;
    });
  }, [viewMode, scrollToBottomYearsView]);

  useEffect(() => {
    maybeAutoScrollYearsToBottom();
  }, [maybeAutoScrollYearsToBottom]);

  useEffect(() => {
    if (viewMode !== 'years') {
      hasAutoScrolledYearsRef.current = false;
    }
  }, [viewMode]);

  const openMonthsView = useCallback(() => {
    setViewMode((prev) => (prev === 'months' ? 'days' : 'months'));
  }, []);

  const openYearsView = useCallback(() => {
    setViewMode((prev) => (prev === 'years' ? 'days' : 'years'));
  }, []);

  const isDateDisabled = useCallback(
    (date: Date) => {
      if (minDate && isBefore(date, minDate)) return true;
      if (maxDate && isAfter(date, maxDate)) return true;
      return false;
    },
    [minDate, maxDate],
  );

  const getMarkerForDate = useCallback(
    (date: Date): MarkedDate | undefined => {
      const dateKey = format(date, 'yyyy-MM-dd');
      return markedDates[dateKey];
    },
    [markedDates],
  );

  // ============================================================================
  // Render Functions
  // ============================================================================

  const renderHeader = () => {
    const currentMonthIndex = getMonth(viewDate);
    const translatedMonth = t(MONTH_KEYS[currentMonthIndex]);

    return (
      <View
        className={cn(
          'mb-4 flex-row items-center justify-between',
          isRTL && 'flex-row-reverse',
        )}>
        <NavButton onPress={handlePrevMonth} disabled={!canGoBack}>
          <Icon as={ChevronLeft} />
        </NavButton>

        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={openMonthsView}
            className={cn(
              'rounded-lg px-2 py-2 active:bg-foreground/20',
              viewMode === 'months' && 'bg-foreground/15',
            )}>
            <Text className="text-lg font-semibold text-foreground">
              {translatedMonth}
            </Text>
          </Pressable>
          <Pressable
            onPress={openYearsView}
            className={cn(
              'rounded-lg px-2 py-2 active:bg-foreground/20',
              viewMode === 'years' && 'bg-foreground/15',
            )}>
            <Text className="text-lg font-semibold text-foreground">
              {format(viewDate, 'yyyy')}
            </Text>
          </Pressable>
        </View>

        <NavButton onPress={handleNextMonth} disabled={!canGoForward}>
          <Icon as={ChevronRight} />
        </NavButton>
      </View>
    );
  };

  const renderWeekdayLabels = () => (
    <View className="mb-2 flex-row">
      {WEEKDAY_KEYS.map((dayKey) => (
        <View key={dayKey} className="h-10 flex-1 items-center justify-center">
          <Text className="text-xs font-medium text-muted-foreground">{t(dayKey)}</Text>
        </View>
      ))}
    </View>
  );

  const renderDaysView = () => {
    const weeks: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }

    return (
      <View>
        {renderWeekdayLabels()}
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} className="flex-row">
            {week.map((date) => {
              const isSelected = isSameDay(date, value);
              const isCurrentMonth = isSameMonth(date, viewDate);
              const isDisabled = isDateDisabled(date);
              const marker = getMarkerForDate(date);

              return (
                <View key={date.toISOString()} className="flex-1 items-center">
                  <DayCell
                    date={date}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    isCurrentMonth={isCurrentMonth}
                    marker={marker}
                    themeColor={themeColor}
                    onPress={() => handleDayPress(date)}
                    renderDay={renderDay}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const renderMonthsView = () => (
    <View className="flex-row flex-wrap">
      {MONTH_SHORT_KEYS.map((monthKey, index) => {
        const isCurrentMonth = index === getMonth(viewDate);

        // Check if month is disabled
        const monthDate = setMonth(viewDate, index);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);

        const isDisabled =
          (minDate && isBefore(monthEnd, minDate)) ||
          (maxDate && isAfter(monthStart, maxDate));

        return (
          <Pressable
            key={monthKey}
            onPress={() => !isDisabled && handleMonthSelect(index)}
            disabled={isDisabled}
            className={cn(
              'w-1/3 items-center justify-center rounded-lg py-4',
              !isDisabled && 'active:bg-primary/50',
              isCurrentMonth && themeColor,
              isDisabled && 'opacity-30',
            )}>
            <Text
              className={cn(
                'text-base font-medium text-foreground',
                isCurrentMonth && 'text-primary-foreground',
                isDisabled && 'text-muted-foreground',
              )}>
              {t(monthKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderYearsView = () => {
    const currentYear = getYear(viewDate);

    return (
      <ScrollView
        ref={yearsScrollRef}
        className="max-h-72"
        showsVerticalScrollIndicator={true}
        contentContainerClassName="flex-row flex-wrap"
        onContentSizeChange={() => {
          maybeAutoScrollYearsToBottom();
        }}>
        {years.map((year) => {
          const isCurrentYear = year === currentYear;
          return (
            <Pressable
              key={year}
              onPress={() => handleYearSelect(year)}
              className={cn(
                'w-1/4 items-center justify-center rounded-lg py-3',
                'active:bg-primary/50',
                isCurrentYear && themeColor,
              )}>
              <Text
                className={cn(
                  'text-base font-medium text-foreground',
                  isCurrentYear && 'text-primary-foreground',
                )}>
                {year}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View className={cn('bg-card rounded-2xl p-4', containerClassName)}>
      {renderHeader()}
      {viewMode === 'days' && renderDaysView()}
      {viewMode === 'months' && renderMonthsView()}
      {viewMode === 'years' && renderYearsView()}
    </View>
  );
}

export default DatePicker;
