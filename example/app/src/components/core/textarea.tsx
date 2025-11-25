import { cva, type VariantProps } from 'class-variance-authority';
import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

/**
 * TextArea component with error state handling.
 *
 * @example
 * ```tsx
 * <TextArea
 *   value={input}
 *   onChange={(e) => setInput(e.target.value)}
 *   error={validationError}
 *   placeholder="Enter JSON here"
 * />
 * ```
 *
 * **States:** `default`, `error`, `success`
 *
 * **Props:** `error` - displays inline error message when provided
 *
 * **Usage:** Use for all multi-line text inputs
 */
const textareaVariants = cva(
  'w-full p-3 font-mono text-sm bg-gray-50 border rounded-lg focus:outline-none focus:ring-2 transition-colors',
  {
    variants: {
      state: {
        default: 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
        error: 'border-red-500 focus:ring-red-500 focus:border-red-500',
        success: 'border-green-500 focus:ring-green-500 focus:border-green-500',
      },
    },
    defaultVariants: {
      state: 'default',
    },
  }
);

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, state, error, ...props }, ref) => {
    const effectiveState = error ? 'error' : state;

    return (
      <div className="relative w-full">
        <textarea
          ref={ref}
          className={cn(textareaVariants({ state: effectiveState }), className)}
          {...props}
        />
        {error && (
          <div className="absolute bottom-2 right-2 bg-red-100 border border-red-300 rounded px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
