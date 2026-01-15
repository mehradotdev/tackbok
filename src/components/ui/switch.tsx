import { Switch as RNSwitch, SwitchProps as RNSwitchProps } from 'react-native';
import { useUniwind, useCSSVariable } from 'uniwind';

interface SwitchProps extends Omit<RNSwitchProps, 'value' | 'onValueChange'> {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
}

function Switch({ checked, onCheckedChange, disabled, ...props }: SwitchProps) {
  const { theme } = useUniwind();
  const [primary, input] = useCSSVariable(['--color-primary', '--color-input']);

  return (
    <RNSwitch
      value={checked}
      onValueChange={onCheckedChange}
      disabled={disabled}
      // Track color (background when switch is on)
      trackColor={{
        false: input as string,
        true: primary as string,
      }}
      // Thumb color (the button that slides)
      // thumbColor={theme === 'dark' ? '#ffffff' : '#ffffff'}
      // iOS specific style
      ios_backgroundColor={input as string}
      {...props}
    />
  );
}

export { Switch };
