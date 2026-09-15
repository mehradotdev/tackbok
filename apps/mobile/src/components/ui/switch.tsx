import { Switch as RNSwitch, SwitchProps as RNSwitchProps } from 'react-native';
import { useCSSVariable, useUniwind } from 'uniwind';
import { isThemeDark } from '~/lib/theme/themes';

interface SwitchProps extends Omit<RNSwitchProps, 'value' | 'onValueChange'> {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
}

function Switch({ checked, onCheckedChange, disabled, ...props }: SwitchProps) {
  const { theme } = useUniwind();
  const isDark = isThemeDark(theme);
  const [primaryColor, foregroundColor] = useCSSVariable([
    '--color-primary',
    '--color-foreground',
  ]);
  // Input colors can match the surrounding card. Give the off track
  // its own neutral gray and keep the thumb light in both switch states.
  const offTrackColor = isDark ? '#808080' : '#a3a3a3';
  const thumbColor = isDark ? (foregroundColor as string) : '#ffffff';

  return (
    <RNSwitch
      value={checked}
      onValueChange={onCheckedChange}
      disabled={disabled}
      trackColor={{
        false: offTrackColor,
        true: primaryColor as string,
      }}
      thumbColor={thumbColor}
      ios_backgroundColor={offTrackColor}
      {...props}
    />
  );
}

export { Switch };
