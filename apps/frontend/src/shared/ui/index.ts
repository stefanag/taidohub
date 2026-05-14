/**
 * Public surface of `shared/ui` — re-exports the shadcn primitives so callers
 * import from `@/shared/ui` rather than reaching into individual files.
 */
export { Button, buttonVariants, type ButtonProps } from './button.js';
export { Input, type InputProps } from './input.js';
export { Label, type LabelProps } from './label.js';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card.js';
export { FormField, FormMessage, useZodForm, type FormMessageProps } from './form.js';
export { Badge, badgeVariants, type BadgeProps } from './badge.js';

