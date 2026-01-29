import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
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
  addDays,
} from 'date-fns';
import { View, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { FirstDayOfWeek } from '~/types';
import { MONTH_SHORT_KEYS, MONTH_KEYS } from '~/constants';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';

// ============================================================================
// Constants
// ============================================================================

/** Default minimum year when minDate is not provided */
const DEFAULT_MIN_YEAR_OFFSET = 100;
/** Default maximum year when maxDate is not provided */
const DEFAULT_MAX_YEAR_OFFSET = 10;

// ============================================================================
// Types
// ============================================================================

export interface MarkedDate {
  color?: string;
}

/** Maps firstDayOfWeek to date-fns weekStartsOn value */
const WEEK_STARTS_ON_MAP: Record<FirstDayOfWeek, 0 | 1 | 6> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

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
  /** First day of the week */
  firstDayOfWeek?: FirstDayOfWeek;
}

type ViewMode = 'days' | 'months' | 'years';

// Keys for translation - these match the keys in translation files
// Base order starting from Sunday (index 0)
const WEEKDAY_KEYS_BASE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Get weekday keys ordered by first day of week */
function getOrderedWeekdayKeys(firstDayOfWeek: FirstDayOfWeek): string[] {
  const startIndex = WEEK_STARTS_ON_MAP[firstDayOfWeek];
  return [
    ...WEEKDAY_KEYS_BASE.slice(startIndex),
    ...WEEKDAY_KEYS_BASE.slice(0, startIndex),
  ];
}

// ============================================================================
// Helper Components
// ============================================================================

interface NavButtonProps {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  accessibilityLabel: string;
}

function NavButton({ onPress, disabled, children, accessibilityLabel }: NavButtonProps) {
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      variant="ghost"
      size="icon"
      accessibilityLabel={accessibilityLabel}
      className="rounded-full">
      {children}
    </Button>
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
  accessibilityLabel: string;
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
  accessibilityLabel,
}: DayCellProps) {
  if (renderDay) {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: isSelected, disabled: isDisabled }}
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
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
  themeColor = 'bg-primary/60',
  scrollToBottomYearsView = false,
  onMonthChange,
  firstDayOfWeek = 'monday',
}: DatePickerProps) {
  const { t, isRTL } = useTranslation();
  const [viewDate, setViewDate] = useState(value);
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const yearsScrollRef = useRef<ScrollView>(null);
  const hasAutoScrolledYearsRef = useRef(false);

  // Get the weekStartsOn value for date-fns
  const weekStartsOn = WEEK_STARTS_ON_MAP[firstDayOfWeek];

  // Get ordered weekday keys based on first day of week
  const orderedWeekdayKeys = useMemo(
    () => getOrderedWeekdayKeys(firstDayOfWeek),
    [firstDayOfWeek],
  );

  // Generate calendar days for current view month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    // Ensure 6 rows (42 days) are always displayed to prevent layout shifts
    const calendarStart = startOfWeek(monthStart, { weekStartsOn });
    const calendarEnd = addDays(calendarStart, 41);

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [viewDate, weekStartsOn]);

  // Generate years for year selection
  // Uses minDate/maxDate as source of truth, with sensible defaults
  const years = useMemo(() => {
    const thisYear = getYear(new Date());
    const startYear = minDate ? getYear(minDate) : thisYear - DEFAULT_MIN_YEAR_OFFSET;
    const endYear = maxDate ? getYear(maxDate) : thisYear + DEFAULT_MAX_YEAR_OFFSET;
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
      <View className={cn('mb-4 flex-row items-center justify-between')}>
        <NavButton
          onPress={handlePrevMonth}
          disabled={!canGoBack}
          accessibilityLabel={t('Previous month')}>
          <Icon as={!isRTL ? ChevronLeft : ChevronRight} />
        </NavButton>

        <View className="flex-row items-center gap-0">
          <Button
            onPress={openMonthsView}
            variant={viewMode === 'months' ? 'default' : 'outline'}
            accessibilityLabel={t('Select month')}
            accessibilityState={{ expanded: viewMode === 'months' }}
            className="rounded-none px-2">
            <Text className="text-lg font-semibold">{translatedMonth}</Text>
          </Button>
          <Button
            onPress={openYearsView}
            variant={viewMode === 'years' ? 'default' : 'outline'}
            accessibilityLabel={t('Select year')}
            accessibilityState={{ expanded: viewMode === 'years' }}
            className="rounded-none px-2">
            <Text className="text-lg font-semibold">{format(viewDate, 'yyyy')}</Text>
          </Button>
        </View>

        <NavButton
          onPress={handleNextMonth}
          disabled={!canGoForward}
          accessibilityLabel={t('Next month')}>
          <Icon as={!isRTL ? ChevronRight : ChevronLeft} />
        </NavButton>
      </View>
    );
  };

  const renderWeekdayLabels = () => (
    <View className="mb-2 flex-row">
      {orderedWeekdayKeys.map((dayKey) => (
        <View key={dayKey} className="h-10 flex-1 items-center justify-center">
          <Text className="text-sm font-medium text-foreground/80">{t(dayKey)}</Text>
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
              const isDisabled = isDateDisabled(date) || !isCurrentMonth;
              const marker = getMarkerForDate(date);

              const accessibilityLabel = format(date, 'EEEE, MMMM d, yyyy');

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
                    accessibilityLabel={accessibilityLabel}
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

        const translatedMonthName = t(monthKey);

        return (
          <Pressable
            key={monthKey}
            onPress={() => !isDisabled && handleMonthSelect(index)}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={translatedMonthName}
            accessibilityState={{ selected: isCurrentMonth, disabled: isDisabled }}
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
              {translatedMonthName}
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
              accessibilityRole="button"
              accessibilityLabel={String(year)}
              accessibilityState={{ selected: isCurrentYear }}
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
    <View className={cn('w-80 bg-card rounded-2xl p-4', containerClassName)}>
      {renderHeader()}
      {viewMode === 'days' && renderDaysView()}
      {viewMode === 'months' && renderMonthsView()}
      {viewMode === 'years' && renderYearsView()}
    </View>
  );
}

export default DatePicker;
