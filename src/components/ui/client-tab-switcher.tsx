'use client'

import { cn } from '@/lib/utils'

interface ClientTabOption<T extends string> {
    value: T
    label: string
}

interface ClientTabSwitcherProps<T extends string> {
    value: T
    options: ClientTabOption<T>[]
    onValueChange: (value: T) => void
    className?: string
}

/** Selector segmentado tipo pastilla (mismo estilo que Plan y Fuerza) */
export function ClientTabSwitcher<T extends string>({
    value,
    options,
    onValueChange,
    className,
}: ClientTabSwitcherProps<T>) {
    return (
        <div
            className={cn('grid w-full rounded-full bg-muted p-1', className)}
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
            role="tablist"
        >
            {options.map((option) => {
                const isActive = value === option.value

                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onValueChange(option.value)}
                        className={cn(
                            'h-8 truncate rounded-full px-2 text-xs font-semibold transition-all',
                            isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
