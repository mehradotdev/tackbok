import { cn } from '~/lib/utils';
import { TextInput, type TextInputProps } from 'react-native';

function Input({ className, ...props }: TextInputProps & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5 sm:h-9',
        props.editable === false && 'opacity-50',
        // 'placeholder:text-muted-foreground/50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
