import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * CodeBlock component for displaying JSON responses and error messages.
 *
 * @example
 * ```tsx
 * <CodeBlock
 *   code={responseData}
 *   title="Response"
 *   variant="success"
 *   actions={<Button size="sm" onClick={handleClear}>Clear</Button>}
 * />
 *
 * // Error state
 * <CodeBlock
 *   code={errorMessage}
 *   title="Error"
 *   variant="error"
 * />
 * ```
 *
 * **Variants:** `success`, `error`
 *
 * **Props:** `code`, `title`, `actions`
 *
 * **Usage:** Display JSON responses and error messages with syntax highlighting
 */
export interface CodeBlockProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  code: unknown;
  title?: string;
  variant?: 'success' | 'error';
  actions?: ReactNode;
}

export function CodeBlock({
  code,
  title = 'Response',
  variant = 'success',
  actions,
  className,
  ...props
}: CodeBlockProps) {
  return (
    <div
      className={cn('border rounded-lg overflow-hidden', className)}
      {...props}
    >
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-mono text-gray-300">{title}</span>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="bg-gray-900 p-4 max-h-96 overflow-auto">
        <pre
          className={cn(
            'text-sm font-mono',
            variant === 'error' ? 'text-red-400' : 'text-green-400'
          )}
        >
          {typeof code === 'string' ? code : JSON.stringify(code, null, 2)}
        </pre>
      </div>
    </div>
  );
}
