import * as React from 'react'
import { Sparkles, type LucideIcon } from 'lucide-react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AIActionButtonProps = Omit<ButtonProps, 'variant'> & {
  icon?: LucideIcon | null
}

// Standard CTA for launching IA/AI flows across the app. Use this instead of
// repeating inline classes so future IA actions keep the same visual language.
export const AIActionButton = React.forwardRef<HTMLButtonElement, AIActionButtonProps>(
  ({ className, icon: Icon = Sparkles, children, size = 'default', asChild, ...props }, ref) => {
    // When asChild is true, Radix Slot requires exactly one child — skip the icon.
    if (asChild) {
      return (
        <Button
          ref={ref}
          size={size}
          asChild
          className={cn('gap-2 shrink-0', className)}
          {...props}
        >
          {children}
        </Button>
      )
    }

    return (
      <Button
        ref={ref}
        size={size}
        className={cn('gap-2 shrink-0', className)}
        {...props}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {children}
      </Button>
    )
  }
)

AIActionButton.displayName = 'AIActionButton'
