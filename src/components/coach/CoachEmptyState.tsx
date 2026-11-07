import { cn } from '@/lib/utils'

/**
 * Estado vacío del coach: una línea que dice qué falta y, si hay, el paso
 * siguiente. `compact` lo deja en una fila para huecos dentro de una tarjeta.
 */
export function CoachEmptyState({ icon: Icon, title, description, action, compact = false, className }: {
    icon?: React.ComponentType<{ className?: string }>
    title: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
    compact?: boolean
    className?: string
}) {
    if (compact) {
        return (
            <div className={cn('flex items-center gap-3.5 px-4 py-4 sm:px-5', className)}>
                {Icon && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05]">
                        <Icon className="h-[18px] w-[18px] text-muted-foreground" />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{title}</p>
                    {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        )
    }

    return (
        <div className={cn('flex flex-col items-center px-6 py-10 text-center sm:py-14', className)}>
            {Icon && (
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.06]">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                </span>
            )}
            <p className="nt-title text-[18px]">{title}</p>
            {description && <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    )
}
