import { cn } from '~/lib/utils';
import { TextInput, type TextInputProps } from 'react-native';

/**
 * Renders a styled multi-line TextInput that functions as a textarea.
 *
 * Renders a TextInput configured for multi-line input with top-aligned text and styling;
 * when `editable` is false the control is displayed with reduced opacity. All other
 * TextInput props are forwarded to the underlying component.
 *
 * @param className - Additional class names to apply to the input container.
 * @param multiline - Whether the input accepts multiple lines (defaults to true).
 * @param numberOfLines - Suggested number of visible text lines (defaults to 8).
 * @returns The configured TextInput element.
 */
export function Textarea({
  className,
  multiline = true,
  numberOfLines = 8,
  // placeholderClassName,
  ...props
}: TextInputProps & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'text-foreground border-input dark:bg-input/30 flex min-h-16 w-full flex-row rounded-md border bg-transparent px-3 py-2 text-base shadow-sm shadow-black/5 md:text-sm',
        props.editable === false && 'opacity-50',
        className
      )}
      // placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  );
}