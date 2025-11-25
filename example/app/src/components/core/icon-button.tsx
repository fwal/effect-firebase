import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * IconButton component for icon-only buttons.
 *
 * @example
 * ```tsx
 * <IconButton
 *   icon={<MenuIcon />}
 *   variant="ghost"
 *   onClick={() => setMenuOpen(!menuOpen)}
 * />
 *
 * // With emoji
 * <IconButton icon="☰" onClick={toggleMenu} />
 * ```
 *
 * **Variants:** `default`, `ghost`, `primary`
 *
 * **Sizes:** `sm`, `md`, `lg`
 *
 * **Props:** `icon` - ReactNode to display as icon
 *
 * **Usage:** Use for icon-only buttons (e.g., menu toggle, close buttons)
 */
const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-gray-800 text-white hover:bg-gray-700 focus:ring-gray-500',
        ghost:
          'bg-transparent text-gray-400 hover:text-white hover:bg-gray-700 focus:ring-gray-500',
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      },
      size: {
        sm: 'p-1.5 text-sm',
        md: 'p-2 text-base',
        lg: 'p-3 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, icon, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
