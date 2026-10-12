import type { RowState } from '@/lib/billing/ledger'

export const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MONTH_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const PAYMENT_METHODS = ['Transferencia', 'Bizum', 'Efectivo', 'Tarjeta'] as const

export const STATE_META: Record<RowState, { label: string; dot: string; pill: string }> = {
    overdue: { label: 'Vencido', dot: 'bg-destructive', pill: 'bg-destructive/10 text-destructive' },
    missing: { label: 'Sin registrar', dot: 'bg-muted-foreground/50', pill: 'bg-muted text-muted-foreground' },
    pending: { label: 'Pendiente', dot: 'bg-warning', pill: 'bg-warning/15 text-amber-700 dark:text-warning' },
    paid: { label: 'Cobrado', dot: 'bg-success', pill: 'bg-success/10 text-success' },
    waived: { label: 'Exento', dot: 'bg-muted-foreground/30', pill: 'bg-muted text-muted-foreground' },
}

export function moneyFormatter(currency: string, fractionDigits: 0 | 2 = 2) {
    try {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency,
            minimumFractionDigits: fractionDigits === 0 ? 0 : undefined,
            maximumFractionDigits: fractionDigits,
        })
    } catch {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: fractionDigits })
    }
}

/** Importe sin decimales si es redondo (30 €) y con ellos si no (32,50 €) */
export function formatMoney(value: number, currency: string) {
    const rounded = Math.round(value * 100) / 100
    return moneyFormatter(currency, Number.isInteger(rounded) ? 0 : 2).format(rounded)
}

/** 2026-10-15 → «15 oct» */
export function formatDayMonth(dateKey: string) {
    const [, month, day] = dateKey.slice(0, 10).split('-').map(Number)
    return `${day} ${MONTH_SHORT[month - 1].toLowerCase()}`
}

export function initialsOf(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || '?'
}
