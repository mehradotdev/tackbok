import { cn } from '~/lib/utils';
import { TextInput, type TextInputProps } from 'react-native';
import { useTranslation } from '~/lib/i18n';

export function Textarea({
  className,
  multiline = true,
  numberOfLines,
  ref,
  ...props
}: TextInputProps & { ref?: React.Ref<TextInput> }) {
  const { isRTL } = useTranslation();

  return (
    <TextInput
      ref={ref}
      className={cn(
        'text-left text-foreground border-input flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-sm shadow-black/5 md:text-sm',
        props.editable === false && 'opacity-50',
        isRTL && 'text-right',
        className,
      )}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  );
}
