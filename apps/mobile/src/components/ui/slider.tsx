import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Slider from '@expo/ui/community/slider';
import { cn } from 'tailwind-variants';
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
  const [primaryColor, inputColor] = useCSSVariable(['--color-primary', '--color-input']);

  // Color values based on theme
  const minimumTrackTintColor = primaryColor as string;
  const maximumTrackTintColor = inputColor as string;
  const thumbTintColor = primaryColor as string;

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
        thumbTintColor={thumbTintColor}
      />
      {showValue && (
        <Text className="text-base text-foreground ml-3 min-w-[28px] text-right">
          {Math.round(value)}
        </Text>
      )}
    </View>
  );
}
