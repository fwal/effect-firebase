import { cva, type VariantProps } from 'class-variance-authority';
import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

/**
 * Input component with error state handling.
 *
 * @example
 * ```tsx
 * <Input
 *   value={input}
 *   onChange={(e) => setInput(e.target.value)}
 *   error={validationError}
 *   placeholder="Enter text here"
 * />
 * ```
 *
 * **States:** `default`, `error`, `success`
 *
 * **Props:** `error` - displays inline error message when provided
 *
 * **Usage:** Use for all single-line text inputs
 */
const inputVariants = cva(
  'w-full p-3 text-sm bg-gray-50 border rounded-lg focus:outline-none focus:ring-2 transition-colors',
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

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, state, error, ...props }, ref) => {
    const effectiveState = error ? 'error' : state;

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          className={cn(inputVariants({ state: effectiveState }), className)}
          {...props}
        />
        {error && (
          <div className="absolute top-1/2 -translate-y-1/2 right-2 bg-red-100 border border-red-300 rounded px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
