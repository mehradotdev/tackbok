import { TextInput, type TextInputProps } from 'react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';

function Input({ className, ...props }: TextInputProps) {
  const { isRTL } = useTranslation();

  return (
    <TextInput
      className={cn(
        'text-left bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border-theme px-3 py-1 text-base leading-5 shadow-theme sm:h-9 font-body',
        props.editable === false && 'opacity-50',
        isRTL && 'text-right',
        className,
      )}
      // Uniwind uses the 'accent-' prefix to return raw color strings (like "#85766a") 
      // instead of style objects for React Native non-style color props.
      placeholderTextColorClassName="accent-muted-foreground"
      clearButtonMode="while-editing"
      {...props}
    />
  );
}

export { Input };
