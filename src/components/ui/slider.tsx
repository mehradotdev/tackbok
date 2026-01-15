import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Slider from '@react-native-community/slider';
import { cn } from '~/lib/utils';
import { Text } from '~/components/ui/text';

interface SettingsSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  showValue?: boolean;
  className?: string;
  disabled?: boolean;
}

export function SettingsSlider({
  value,
  onValueChange,
  minimumValue,
  maximumValue,
  step = 1,
  showValue = true,
  className,
  disabled = false,
}: SettingsSliderProps) {
  const [primary, muted, background] = useCSSVariable([
    '--color-primary',
    '--color-muted',
    '--color-background',
  ]);

  // Color values based on theme
  const minimumTrackTintColor = primary as string;
  const maximumTrackTintColor = muted as string;
  // const thumbTintColor = background as string;

  return (
    <View className={cn('flex-row items-center', className)}>
      <Slider
        style={{ flex: 1, height: 40 }}
        value={value}
        onValueChange={onValueChange}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        disabled={disabled}
        minimumTrackTintColor={minimumTrackTintColor}
        maximumTrackTintColor={maximumTrackTintColor}
        // thumbTintColor={thumbTintColor}
      />
      {showValue && (
        <Text className="text-sm text-muted-foreground ml-3 min-w-[28px] text-right">
          {Math.round(value)}
        </Text>
      )}
    </View>
  );
}
