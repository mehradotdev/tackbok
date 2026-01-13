import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';

function Input({ className, ...props }: TextInputProps) {
  const { isRTL } = useTranslation();

  return (
    <TextInput
      className={cn(
        'text-left border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5 sm:h-9',
        props.editable === false && 'opacity-50',
        isRTL && 'text-right',
        className,
      )}
      clearButtonMode="while-editing"
      {...props}
    />
  );
}

export { Input };
