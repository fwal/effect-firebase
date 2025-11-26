import { cva } from 'class-variance-authority';
import { AnchorHTMLAttributes, forwardRef } from 'react';
import { createLink, type LinkComponent } from '@tanstack/react-router'
import { cn } from '../../lib/utils';

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
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  icon: string;
  label: string;
  isActive?: boolean;
}

const BasicMenuItem = forwardRef<HTMLAnchorElement, MenuItemProps>(
  ({ icon, label, isActive, className, ...props }, ref) => {
    return (
      <li>
        <a
          ref={ref}
          className={cn(menuItemVariants({ isActive }), className)}
          {...props}
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">
            {icon}
          </span>
          <span className="font-medium">{label}</span>
        </a>
      </li>
    );
  }
);

BasicMenuItem.displayName = 'BasicMenuItem';

const BasicMenuItemLink = createLink(BasicMenuItem);

const MenuItem: LinkComponent<typeof BasicMenuItem> = (props) => {
  return <BasicMenuItemLink {...props} />;
};

export default MenuItem;
