import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

/**
 * Checkbox component with optional label.
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="Validate Input"
 *   checked={validate}
 *   onChange={(e) => setValidate(e.target.checked)}
 * />
 * ```
 *
 * **Props:** `label` - optional label text
 *
 * **Usage:** Use for all checkbox inputs
 */
export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const inputId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={inputId}
          className={cn(
            'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500',
            className
          )}
          {...props}
        />
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
