import { cva, type VariantProps } from 'class-variance-authority';
import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

/**
 * Card component for grouping related content with consistent styling.
 * Includes `Card`, `CardHeader`, and `CardContent` sub-components.
 *
 * @example
 * ```tsx
 * <Card variant="info">
 *   <CardHeader variant="info">Title</CardHeader>
 *   <CardContent variant="info">Content goes here</CardContent>
 * </Card>
 * ```
 *
 * **Variants:** `default`, `info`, `success`, `warning`, `error`, `dark`
 *
 * **Usage:** Use for grouping related content with consistent styling
 */
const cardVariants = cva('rounded-lg border p-4', {
  variants: {
    variant: {
      default: 'bg-white border-gray-200',
      info: 'bg-blue-50 border-blue-200',
      success: 'bg-green-50 border-green-200',
      warning: 'bg-yellow-50 border-yellow-200',
      error: 'bg-red-50 border-red-200',
      dark: 'bg-gray-900 border-gray-700',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

const cardHeaderVariants = cva('mb-2', {
  variants: {
    variant: {
      default: 'text-gray-900',
      info: 'text-blue-900',
      success: 'text-green-900',
      warning: 'text-yellow-900',
      error: 'text-red-900',
      dark: 'text-white',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CardHeaderProps
  extends HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof cardHeaderVariants> {}

export const CardHeader = forwardRef<HTMLHeadingElement, CardHeaderProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <h2
        ref={ref}
        className={cn(
          'text-xl font-semibold',
          cardHeaderVariants({ variant }),
          className
        )}
        {...props}
      />
    );
  }
);

CardHeader.displayName = 'CardHeader';

const cardContentVariants = cva('', {
  variants: {
    variant: {
      default: 'text-gray-700',
      info: 'text-blue-700',
      success: 'text-green-700',
      warning: 'text-yellow-700',
      error: 'text-red-700',
      dark: 'text-gray-300',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CardContentProps
  extends HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof cardContentVariants> {}

export const CardContent = forwardRef<HTMLParagraphElement, CardContentProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn(cardContentVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

CardContent.displayName = 'CardContent';
