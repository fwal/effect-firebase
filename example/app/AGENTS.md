# Agent Rules for Example App

## Component Architecture

This example app follows a structured component architecture with reusable core components to reduce code duplication and maintain consistency.

### Core Components Location

All reusable UI components are located in `src/components/core/`. These components use:

- **Class Variance Authority (cva)** for creating component variants
- **tailwind-merge** for safely merging Tailwind CSS classes
- **cn utility function** (`src/lib/utils.ts`) for combining class names

### Guidelines for New Components

1. **Always use core components** instead of inline Tailwind classes for common UI patterns
2. **Import from barrel export**: Use `import { Button, Card } from './core'`
3. **Use the cn utility** when you need to conditionally apply or merge classes
4. **Create new core components** when a pattern repeats more than twice
5. **Use cva** for components with multiple visual variants
6. **Keep business logic separate** from presentation components
7. **Document with JSDoc comments** including usage examples and available variants

### Component Structure Pattern

When creating new core components:

````typescript
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

/**
 * Component description.
 *
 * @example
 * ```tsx
 * <Component variant="primary" size="md">
 *   Content
 * </Component>
 * ```
 *
 * **Variants:** List variants here
 *
 * **Sizes:** List sizes here
 *
 * **Usage:** When to use this component
 */
const componentVariants = cva(
  'base-classes-here', // Always present
  {
    variants: {
      variant: {
        default: 'variant-classes',
        // ... more variants
      },
      size: {
        sm: 'size-classes',
        // ... more sizes
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface ComponentProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof componentVariants> {
  // Additional custom props
}

export const Component = forwardRef<HTMLElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <element
        ref={ref}
        className={cn(componentVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Component.displayName = 'Component';
````

### Refactoring Existing Components

When refactoring components to use core components:

1. **Identify repeated Tailwind patterns** (buttons, cards, inputs)
2. **Replace with core components** and remove inline classes
3. **Use variant props** instead of conditional className strings
4. **Keep component-specific logic** but delegate presentation to core components
5. **Test that functionality remains unchanged**

### Example Refactor

**Before:**

```tsx
<button
  onClick={handleClick}
  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg 
             hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
>
  {loading ? <Spinner /> : 'Click Me'}
</button>
```

**After:**

```tsx
<Button onClick={handleClick} size="lg" isLoading={loading}>
  Click Me
</Button>
```

## Dependencies

The following packages are required for the core component system:

- `class-variance-authority`: ^0.7.1
- `clsx`: ^2.1.1
- `tailwind-merge`: ^2.5.5

## TypeScript Configuration

Core components use:

- `forwardRef` for ref forwarding
- Generic type parameters when needed
- Proper TypeScript types from `cva` and React

## Maintenance

When adding new UI patterns:

1. Check if existing core components can be extended
2. Consider if the pattern will be reused (>2 times)
3. Create a new core component following the pattern above
4. Add comprehensive JSDoc documentation with examples
5. Export from `core/index.ts`
