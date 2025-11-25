import { cva } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/utils';

const menuItemVariants = cva(
  'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 w-full text-left',
  {
    variants: {
      isActive: {
        true: 'bg-gray-700 text-white',
        false: 'text-gray-300 hover:bg-gray-700 hover:text-white',
      },
    },
    defaultVariants: {
      isActive: false,
    },
  }
);

interface MenuItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string;
  label: string;
  isActive?: boolean;
}

const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ icon, label, isActive, className, ...props }, ref) => {
    return (
      <li>
        <button
          ref={ref}
          className={cn(menuItemVariants({ isActive }), className)}
          {...props}
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">
            {icon}
          </span>
          <span className="font-medium">{label}</span>
        </button>
      </li>
    );
  }
);

MenuItem.displayName = 'MenuItem';

export default MenuItem;
