import { cn } from '@/lib/utils'

/**
 * Cabecera de un bloque del coach: titular corto en Inter Tight, contador
 * opcional y una pista en mono a la derecha. Sustituye al icono + negrita + raya.
 */
export function SectionHeading({ title, count, helper, countTone, action, className }: {
    title: React.ReactNode
    count?: number
    helper?: React.ReactNode
    countTone?: 'danger' | 'warning'
    /** Botón o enlace a la derecha (sustituye a la pista en mono) */
    action?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5', className)}>
            <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="nt-title truncate text-[17px]">{title}</h2>
                {count !== undefined && count > 0 && (
                    <span className={cn(
                        'flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums',
                        countTone === 'danger' ? 'bg-red-500/[0.12] text-red-600 dark:text-red-400'
                            : countTone === 'warning' ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300'
                                : 'bg-foreground/[0.07] text-foreground'
                    )}>
                        {count}
                    </span>
                )}
            </div>
            {action ?? (helper && <p className="nt-eyebrow hidden truncate text-[10px] text-muted-foreground sm:block">{helper}</p>)}
        </div>
    )
}
