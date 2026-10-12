'use client'

import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, PartyPopper } from 'lucide-react'
import { CatalogList } from '@/components/coach/CatalogList'
import { cn } from '@/lib/utils'
import { buildYear, debtsByClient, periodIndex, type YearMonth } from '@/lib/billing/ledger'
import type { BillingLedgerData } from '@/types/billing'
import { MONTH_LONG, MONTH_SHORT, STATE_META, formatMoney, initialsOf, moneyFormatter } from './billing-format'

interface YearViewProps {
    ledger: BillingLedgerData
    onOpenMonth: (month: number) => void
}

const dueOf = (m: YearMonth) => m.pending + m.overdue + m.missing
const totalOf = (m: YearMonth) => m.collected + dueOf(m) + m.forecast

/** Máximo «redondo» para el eje: 1.560 → 2.000, 340 → 400 */
function niceMax(value: number) {
    if (value <= 0) return 100
    const magnitude = 10 ** Math.floor(Math.log10(value))
    const step = magnitude / 2
    return Math.ceil(value / step) * step
}

export function YearView({ ledger, onOpenMonth }: YearViewProps) {
    const { year, today, currency, clients, records, previousYearCollected } = ledger
    const money = (value: number) => formatMoney(value, currency)
    const compact = moneyFormatter(currency, 0)

    const months = useMemo(() => buildYear(clients, records, year, today), [clients, records, year, today])
    const debts = useMemo(() => debtsByClient(clients, records, year, today), [clients, records, year, today])
    const todayPeriod = periodIndex(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
    const currentMonth = Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) : null

    const collected = months.reduce((sum, m) => sum + m.collected, 0)
    const due = months.reduce((sum, m) => sum + dueOf(m), 0)
    const forecast = months.reduce((sum, m) => sum + m.forecast, 0)
    const closing = collected + due + forecast
    const elapsed = months.filter(m => !m.isForecast && m.collected + dueOf(m) > 0)
    const average = elapsed.length > 0 ? collected / elapsed.length : 0
    const growth = previousYearCollected > 0 ? ((collected - previousYearCollected) / previousYearCollected) * 100 : null

    const axisMax = niceMax(Math.max(...months.map(totalOf)))
    const [selected, setSelected] = useState<number | null>(currentMonth)
    const selectedMonth = selected ? months[selected - 1] : null

    return (
        <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Kpi
                    label={`Cobrado ${year}`}
                    value={money(collected)}
                    hint={growth === null
                        ? (previousYearCollected === 0 ? `Sin datos de ${year - 1}` : undefined)
                        : (
                            <span className={cn('inline-flex items-center gap-0.5 font-medium', growth >= 0 ? 'text-success' : 'text-destructive')}>
                                {growth >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                {Math.abs(growth).toLocaleString('es-ES', { maximumFractionDigits: 0 })}% vs {year - 1}
                            </span>
                        )}
                />
                <Kpi
                    label="Por cobrar"
                    value={money(due)}
                    tone={due > 0 ? 'warning' : undefined}
                    hint={debts.length > 0
                        ? `${debts.length} ${debts.length === 1 ? 'atleta' : 'atletas'} con atrasos`
                        : due > 0 ? 'Nada atrasado' : 'Todo al día'}
                />
                <Kpi label="Previsión de cierre" value={money(closing)} hint={forecast > 0 ? `Incluye ${money(forecast)} por venir` : 'Año cerrado'} />
                <Kpi label="Media mensual" value={money(average)} hint={elapsed.length > 0 ? `En ${elapsed.length} ${elapsed.length === 1 ? 'mes' : 'meses'} con cobros` : 'Sin cobros aún'} />
            </div>

            {/* Gráfico */}
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ingresos por mes</p>
                        {selectedMonth ? (
                            <p className="mt-0.5 text-sm">
                                <span className="font-semibold">{MONTH_LONG[selectedMonth.month - 1]}</span>
                                <span className="text-muted-foreground"> · </span>
                                {selectedMonth.isForecast
                                    ? <span className="tabular-nums text-muted-foreground">previsión {money(selectedMonth.forecast)}</span>
                                    : (
                                        <span className="tabular-nums text-muted-foreground">
                                            <span className="font-medium text-success">{money(selectedMonth.collected)}</span> cobrado
                                            {dueOf(selectedMonth) > 0 && <> · <span className="font-medium text-foreground">{money(dueOf(selectedMonth))}</span> por cobrar</>}
                                        </span>
                                    )}
                                <button type="button" onClick={() => onOpenMonth(selectedMonth.month)} className="ml-2 inline-flex items-center text-xs font-semibold text-primary hover:underline">
                                    Ver mes<ChevronRight className="h-3 w-3" />
                                </button>
                            </p>
                        ) : (
                            <p className="mt-0.5 text-sm text-muted-foreground">Toca un mes para ver el detalle</p>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <Legend className="bg-success" label="Cobrado" />
                        <Legend className="bg-warning" label="Por cobrar" />
                        <Legend className="bg-muted-foreground/35" label="Sin registrar" />
                        <Legend className="border border-dashed border-primary/60 bg-primary/10" label="Previsión" />
                    </div>
                </div>

                <div className="relative mt-5 h-48 sm:h-56">
                    {/* Rejilla */}
                    {[1, 0.5, 0].map(fraction => (
                        <div key={fraction} className="absolute inset-x-0 flex items-center" style={{ bottom: `${fraction * 100}%` }}>
                            <span className="w-10 shrink-0 -translate-y-1/2 pr-2 text-right text-[10px] tabular-nums text-muted-foreground/80 sm:w-12">
                                {fraction === 0 ? '0' : compact.format(axisMax * fraction).replace(/\s?€/, '€')}
                            </span>
                            <div className={cn('h-px flex-1 -translate-y-1/2', fraction === 0 ? 'bg-border' : 'border-t border-dashed border-border/70')} />
                        </div>
                    ))}

                    {/* Barras */}
                    <div className="absolute inset-y-0 left-10 right-0 flex items-end gap-1 sm:left-12 sm:gap-2">
                        {months.map(m => {
                            const total = totalOf(m)
                            const isSelected = selected === m.month
                            return (
                                <button
                                    key={m.month}
                                    type="button"
                                    onClick={() => setSelected(isSelected ? null : m.month)}
                                    aria-label={`${MONTH_LONG[m.month - 1]}: ${money(m.collected)} cobrado`}
                                    className={cn(
                                        'group relative flex h-full flex-1 flex-col justify-end rounded-t-lg transition-colors',
                                        isSelected ? 'bg-muted/70' : 'hover:bg-muted/40',
                                    )}
                                >
                                    {total > 0 && (
                                        <div
                                            className={cn('mx-auto flex w-full max-w-[28px] flex-col-reverse overflow-hidden rounded-t-[5px] transition-opacity', selected && !isSelected && 'opacity-55')}
                                            style={{ height: `${(total / axisMax) * 100}%`, minHeight: 3 }}
                                        >
                                            {m.isForecast ? (
                                                <div className="h-full rounded-t-[5px] border border-b-0 border-dashed border-primary/60 bg-primary/10" />
                                            ) : (
                                                <>
                                                    <div className="bg-success" style={{ height: `${(m.collected / total) * 100}%` }} />
                                                    <div className="bg-warning" style={{ height: `${((m.pending + m.overdue) / total) * 100}%` }} />
                                                    <div className="bg-muted-foreground/35" style={{ height: `${(m.missing / total) * 100}%` }} />
                                                </>
                                            )}
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
                <div className="ml-10 mt-1.5 flex gap-1 sm:ml-12 sm:gap-2">
                    {months.map(m => (
                        <span
                            key={m.month}
                            className={cn(
                                'flex-1 text-center text-[10px] sm:text-[11px]',
                                m.month === currentMonth ? 'font-bold text-foreground' : 'text-muted-foreground',
                            )}
                        >
                            <span className="sm:hidden">{MONTH_SHORT[m.month - 1][0]}</span>
                            <span className="hidden sm:inline">{MONTH_SHORT[m.month - 1]}</span>
                        </span>
                    ))}
                </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
                {/* Meses */}
                <section className="space-y-2">
                    <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes a mes</h2>
                    <CatalogList>
                        {months.map(m => {
                            const expected = m.collected + dueOf(m)
                            const pct = expected > 0 ? (m.collected / expected) * 100 : 0
                            const isCurrent = periodIndex(year, m.month) === todayPeriod
                            return (
                                <li key={m.month}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenMonth(m.month)}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                                    >
                                        <span className={cn('w-20 shrink-0 text-sm', isCurrent ? 'font-bold' : 'font-medium', m.isForecast && 'text-muted-foreground')}>
                                            {MONTH_LONG[m.month - 1]}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            {m.isForecast ? (
                                                <div className="h-1.5 rounded-full border border-dashed border-border" />
                                            ) : (
                                                <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                                                    <div className="bg-success" style={{ width: `${pct}%` }} />
                                                    {m.overdue + m.missing > 0 && (
                                                        <div className="bg-destructive/60" style={{ width: `${((m.overdue + m.missing) / expected) * 100}%`, marginLeft: 'auto' }} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <span className="w-[5.5rem] shrink-0 text-right text-sm tabular-nums">
                                            {m.isForecast
                                                ? <span className="text-muted-foreground">{m.forecast > 0 ? `~${money(m.forecast)}` : '—'}</span>
                                                : <span className="font-semibold">{expected > 0 ? money(m.collected) : '—'}</span>}
                                        </span>
                                        <MonthBadge month={m} />
                                    </button>
                                </li>
                            )
                        })}
                    </CatalogList>
                </section>

                {/* Deudas */}
                <section className="space-y-2">
                    <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pagos atrasados en {year}</h2>
                    {debts.length === 0 ? (
                        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-10 text-center">
                            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10">
                                <PartyPopper className="h-5 w-5 text-success" />
                            </div>
                            <p className="text-sm font-semibold">Nadie va atrasado</p>
                            <p className="mt-1 text-xs text-muted-foreground">No hay cobros vencidos ni meses sin registrar.</p>
                        </div>
                    ) : (
                        <CatalogList>
                            {debts.map(debt => (
                                <li key={debt.clientId} className="flex items-start gap-3 px-4 py-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                        {initialsOf(debt.name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className="truncate text-sm font-semibold">{debt.name}</p>
                                            <p className="shrink-0 text-sm font-semibold tabular-nums">{money(debt.amount)}</p>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {debt.months.map(item => (
                                                <button
                                                    key={item.month}
                                                    type="button"
                                                    onClick={() => onOpenMonth(item.month)}
                                                    title={STATE_META[item.state].label}
                                                    className={cn('flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-opacity hover:opacity-80', STATE_META[item.state].pill)}
                                                >
                                                    <span className={cn('h-1.5 w-1.5 rounded-full', STATE_META[item.state].dot)} />
                                                    {MONTH_SHORT[item.month - 1]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </CatalogList>
                    )}
                </section>
            </div>
        </div>
    )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: 'warning' }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm sm:p-4">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('mt-1 truncate text-xl font-bold tracking-tight tabular-nums sm:text-2xl', tone === 'warning' && 'text-amber-600 dark:text-warning')}>{value}</p>
            {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

function Legend({ className, label }: { className: string; label: string }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-[3px]', className)} />
            {label}
        </span>
    )
}

function MonthBadge({ month }: { month: YearMonth }) {
    if (month.isForecast) return <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">Previsión</span>
    const expected = month.collected + dueOf(month)
    let label = 'Sin cobros'
    let tone = 'text-muted-foreground'
    if (expected > 0 && dueOf(month) === 0) {
        label = 'Al día'
        tone = 'text-success'
    } else if (month.overdue + month.missing > 0) {
        label = 'Con deudas'
        tone = 'text-destructive'
    } else if (month.pending > 0) {
        label = 'En curso'
        tone = 'text-amber-600 dark:text-warning'
    }
    return <span className={cn('hidden w-24 shrink-0 text-right text-xs font-medium sm:block', tone)}>{label}</span>
}
