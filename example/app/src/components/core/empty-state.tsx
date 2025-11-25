import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * EmptyState component for displaying placeholder when no data is available.
 *
 * @example
 * ```tsx
 * <EmptyState message="No data yet. Click the button above to send a request." />
 *
 * // With custom icon
 * <EmptyState
 *   icon={<CustomIcon />}
 *   message="No items found"
 * />
 * ```
 *
 * **Props:** `icon`, `message`
 *
 * **Usage:** Display when no data is available
 */
export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  message: string;
}

export function EmptyState({
  icon,
  message,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500',
        className
      )}
      {...props}
    >
      {icon || (
        <svg
          className="mx-auto h-12 w-12 mb-3 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      )}
      <p>{message}</p>
    </div>
  );
}
