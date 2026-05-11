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

export function ClientTabSwitcher<T extends string>({
    value,
    options,
    onValueChange,
    className,
}: ClientTabSwitcherProps<T>) {
    return (
        <div className={cn('border-b border-border bg-background/95 px-4', className)}>
            <div
                className="grid h-12 w-full text-muted-foreground"
                style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
            >
                {options.map((option) => {
                    const isActive = value === option.value

                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onValueChange(option.value)}
                            className={cn(
                                'relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-2 text-sm font-semibold shadow-none transition-colors',
                                isActive ? 'border-primary text-primary' : 'text-muted-foreground'
                            )}
                        >
                            {option.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
