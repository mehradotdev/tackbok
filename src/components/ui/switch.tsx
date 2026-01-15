import { Switch as RNSwitch, SwitchProps as RNSwitchProps } from 'react-native';
import { useCSSVariable } from 'uniwind';

interface SwitchProps extends Omit<RNSwitchProps, 'value' | 'onValueChange'> {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
}

function Switch({ checked, onCheckedChange, disabled, ...props }: SwitchProps) {
  const [primaryColor, backgroundColor, inputColor] = useCSSVariable([
    '--color-primary',
    '--color-background',
    '--color-input',
  ]);

  return (
    <RNSwitch
      value={checked}
      onValueChange={onCheckedChange}
      disabled={disabled}
      // Track color (background when switch is on)
      trackColor={{
        false: inputColor as string,
        true: primaryColor as string,
      }}
      // Thumb color (the button that slides)
      thumbColor={backgroundColor as string}
      // iOS specific style
      ios_backgroundColor={inputColor as string}
      {...props}
    />
  );
}

export { Switch };
