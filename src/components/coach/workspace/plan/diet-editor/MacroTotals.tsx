import { compareToTarget } from '@/lib/nutrition/diet-macros'
import { cn } from '@/lib/utils'
import type { MealTarget } from '@/lib/nutrition/diet-plan-model'

export const MACRO_META = [
    { key: 'kcal', label: 'kcal', short: '', color: 'text-foreground', unit: '' },
    { key: 'protein_g', label: 'Proteína', short: 'P', color: 'text-rose-600 dark:text-rose-400', unit: 'g' },
    { key: 'carbs_g', label: 'Hidratos', short: 'C', color: 'text-amber-600 dark:text-amber-400', unit: 'g' },
    { key: 'fat_g', label: 'Grasa', short: 'G', color: 'text-sky-600 dark:text-sky-400', unit: 'g' },
] as const

const STATUS_CLASS = {
    ok: 'bg-success/10 text-success ring-success/20',
    warn: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400',
    off: 'bg-destructive/10 text-destructive ring-destructive/20',
} as const

export function statusDotClass(status: 'ok' | 'warn' | 'off' | 'none') {
    return status === 'ok' ? 'bg-success' : status === 'warn' ? 'bg-amber-500' : status === 'off' ? 'bg-destructive' : 'bg-muted-foreground/30'
}

interface MacroTotalsProps {
    totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
    target?: MealTarget | null
    className?: string
}

/** Totales de una opción; con objetivo, cada macro se colorea según la desviación */
export function MacroTotals({ totals, target, className }: MacroTotalsProps) {
    const comparison = compareToTarget(totals, target ?? null)

    return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
            {MACRO_META.map(meta => {
                const value = Math.round(totals[meta.key])
                const check = comparison.byMacro[meta.key]
                return (
                    <span
                        key={meta.key}
                        className={cn(
                            'inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-xs tabular-nums ring-1 ring-inset',
                            check ? STATUS_CLASS[check.status] : 'bg-muted/60 text-foreground ring-transparent'
                        )}
                        title={check ? `${meta.label}: ${value}${meta.unit} de ${Math.round(check.target)}${meta.unit} (${check.diff > 0 ? '+' : ''}${Math.round(check.diff)})` : meta.label}
                    >
                        {meta.short && <span className={cn('font-semibold', !check && meta.color)}>{meta.short}</span>}
                        <span className="font-semibold">{value}</span>
                        {check && <span className="opacity-70">/{Math.round(check.target)}</span>}
                        {meta.key === 'kcal' && <span className="opacity-70">kcal</span>}
                    </span>
                )
            })}
        </div>
    )
}
