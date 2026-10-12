'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, ChevronDown, Loader2, MoreHorizontal, Receipt, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CatalogEmpty, CatalogList } from '@/components/coach/CatalogList'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
    buildMonthRows,
    clientsWithoutFee,
    feeOf,
    isBillable,
    periodIndex,
    summarizeMonth,
    type LedgerClient,
    type MonthRow,
    type RowState,
} from '@/lib/billing/ledger'
import type { BillingLedgerData, PaymentStatus } from '@/types/billing'
import { createPaymentRecordAction, markRecordsPaidAction, updatePaymentStatusAction } from './billing-actions'
import type { RecordDialogTarget } from './BillingDialogs'
import { MONTH_LONG, PAYMENT_METHODS, STATE_META, formatDayMonth, formatMoney, initialsOf } from './billing-format'

type Filter = 'all' | 'due' | 'overdue' | 'missing' | 'paid' | 'waived'

const FILTERS: Array<{ value: Filter; label: string; states: RowState[] }> = [
    { value: 'all', label: 'Todos', states: ['overdue', 'missing', 'pending', 'paid', 'waived'] },
    { value: 'due', label: 'Por cobrar', states: ['overdue', 'missing', 'pending'] },
    { value: 'overdue', label: 'Vencidos', states: ['overdue'] },
    { value: 'missing', label: 'Sin registrar', states: ['missing'] },
    { value: 'paid', label: 'Cobrados', states: ['paid'] },
    { value: 'waived', label: 'Exentos', states: ['waived'] },
]

const SEGMENTS: Array<{ state: Exclude<RowState, 'waived'>; label: string; bar: string; filter: Filter }> = [
    { state: 'paid', label: 'Cobrado', bar: 'bg-success', filter: 'paid' },
    { state: 'pending', label: 'Pendiente', bar: 'bg-warning', filter: 'due' },
    { state: 'overdue', label: 'Vencido', bar: 'bg-destructive', filter: 'overdue' },
    { state: 'missing', label: 'Sin registrar', bar: 'bg-muted-foreground/35', filter: 'missing' },
]

interface MonthViewProps {
    ledger: BillingLedgerData
    month: number
    onChanged: () => void
    onOpenRecord: (target: RecordDialogTarget) => void
    onOpenFee: (client: LedgerClient) => void
}

export function MonthView({ ledger, month, onChanged, onOpenRecord, onOpenFee }: MonthViewProps) {
    const { toast } = useToast()
    const { year, today, currency, clients, records } = ledger
    const [filter, setFilter] = useState<Filter>('all')
    const [search, setSearch] = useState('')
    const [busyKey, setBusyKey] = useState<string | null>(null)
    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulkMethod, setBulkMethod] = useState<string | null>(null)
    const [bulkSaving, setBulkSaving] = useState(false)

    const money = (value: number) => formatMoney(value, currency)
    const todayPeriod = periodIndex(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
    const isFuture = periodIndex(year, month) > todayPeriod
    const isCurrent = periodIndex(year, month) === todayPeriod

    const rows = useMemo(() => buildMonthRows(clients, records, year, month, today), [clients, records, year, month, today])
    const summary = useMemo(() => summarizeMonth(rows), [rows])
    const withoutFee = useMemo(() => clientsWithoutFee(clients), [clients])
    const forecast = useMemo(
        () => isFuture ? clients.filter(client => isBillable(client, year, month)).reduce((sum, client) => sum + feeOf(client), 0) : 0,
        [clients, isFuture, year, month],
    )

    const filterDef = FILTERS.find(f => f.value === filter) ?? FILTERS[0]
    const query = search.trim().toLocaleLowerCase('es')
    const visibleRows = rows.filter(row =>
        filterDef.states.includes(row.state) &&
        (!query || row.name.toLocaleLowerCase('es').includes(query) || row.email.toLocaleLowerCase('es').includes(query)))
    const bulkIds = visibleRows
        .filter(row => row.record && (row.state === 'pending' || row.state === 'overdue'))
        .map(row => row.record!.id)
    const bulkAmount = visibleRows
        .filter(row => row.record && (row.state === 'pending' || row.state === 'overdue'))
        .reduce((sum, row) => sum + row.amount, 0)
    const visibleMissing = visibleRows.filter(row => row.state === 'missing').length

    const countFor = (value: Filter) => {
        const def = FILTERS.find(f => f.value === value)!
        return def.states.reduce((sum, state) => sum + summary.counts[state], 0)
    }

    const run = async (key: string, task: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
        setBusyKey(key)
        const result = await task()
        setBusyKey(null)
        if (!result.success) {
            toast({ title: 'No se pudo guardar', description: result.error, variant: 'destructive' })
            return
        }
        toast({ title: okMessage })
        onChanged()
    }

    const charge = (row: MonthRow, method: string | null) => run(
        row.key,
        () => row.record
            ? updatePaymentStatusAction(row.record.id, 'paid', method)
            : createPaymentRecordAction({ clientId: row.clientId, year, month, amount: row.amount, status: 'paid', paymentMethod: method }),
        `${row.name}: cobrado`,
    )

    const setStatus = (row: MonthRow, status: PaymentStatus, message: string) => run(
        row.key,
        () => row.record
            ? updatePaymentStatusAction(row.record.id, status)
            : createPaymentRecordAction({ clientId: row.clientId, year, month, amount: row.amount, status }),
        message,
    )

    const runBulk = async () => {
        setBulkSaving(true)
        const result = await markRecordsPaidAction(bulkIds, bulkMethod)
        setBulkSaving(false)
        setBulkOpen(false)
        if (!result.success) {
            toast({ title: 'No se pudieron marcar', description: result.error, variant: 'destructive' })
            return
        }
        toast({ title: `${result.data?.updatedCount ?? 0} cobros marcados como cobrados` })
        onChanged()
    }

    const progress = summary.expected > 0 ? Math.round((summary.collected / summary.expected) * 100) : 0

    return (
        <div className="space-y-4">
            {/* Resumen del mes */}
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
                {isFuture ? (
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Previsión · {MONTH_LONG[month - 1]}</p>
                        <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{money(forecast)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Según las cuotas actuales. Los cobros se generan al empezar el mes.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Cobrado · {MONTH_LONG[month - 1]}
                                </p>
                                <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{money(summary.collected)}</p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    de <span className="font-medium text-foreground tabular-nums">{money(summary.expected)}</span> previstos
                                </p>
                            </div>
                            <div className={cn(
                                'shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums',
                                progress >= 100 ? 'bg-success/10 text-success' : 'bg-muted text-foreground',
                            )}>
                                {summary.expected > 0 ? `${progress}%` : '—'}
                            </div>
                        </div>

                        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
                            {summary.expected > 0 && SEGMENTS.map(segment => {
                                const value = segment.state === 'paid' ? summary.collected : summary[segment.state]
                                if (value <= 0) return null
                                return (
                                    <div
                                        key={segment.state}
                                        className={cn('h-full border-r-2 border-card last:border-r-0', segment.bar)}
                                        style={{ width: `${(value / summary.expected) * 100}%` }}
                                    />
                                )
                            })}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                            {SEGMENTS.map(segment => {
                                const value = segment.state === 'paid' ? summary.collected : summary[segment.state]
                                const count = summary.counts[segment.state]
                                return (
                                    <button
                                        key={segment.state}
                                        type="button"
                                        onClick={() => setFilter(filter === segment.filter ? 'all' : segment.filter)}
                                        className={cn(
                                            'rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/70',
                                            filter === segment.filter && 'bg-muted',
                                            count === 0 && 'opacity-50',
                                        )}
                                    >
                                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <span className={cn('h-2 w-2 rounded-full', segment.bar)} />
                                            {segment.label}
                                            <span className="tabular-nums">· {count}</span>
                                        </span>
                                        <span className="mt-0.5 block text-sm font-semibold tabular-nums">{money(value)}</span>
                                    </button>
                                )
                            })}
                        </div>
                        {summary.counts.waived > 0 && (
                            <p className="mt-2 px-2.5 text-xs text-muted-foreground">
                                {summary.counts.waived} {summary.counts.waived === 1 ? 'atleta exento' : 'atletas exentos'} este mes ({money(summary.waived)}), no cuentan en lo previsto.
                            </p>
                        )}
                    </>
                )}
            </section>

            {/* Atletas que no se facturan por no tener cuota */}
            {withoutFee.length > 0 && (isCurrent || isFuture) && (
                <section className="rounded-2xl border border-warning/40 bg-warning/[0.06] p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-warning" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                                {withoutFee.length === 1 ? '1 atleta activo sin cuota' : `${withoutFee.length} atletas activos sin cuota`}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">No se les factura hasta que tengan cuota. Si entrenan gratis, puedes ignorarlo.</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {withoutFee.map(client => (
                                    <button
                                        key={client.id}
                                        type="button"
                                        onClick={() => onOpenFee(client)}
                                        className="flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card pl-1 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted"
                                    >
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                                            {initialsOf(client.full_name || '?')}
                                        </span>
                                        {client.full_name || client.email}
                                        <span className="text-primary">· Poner cuota</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Filtros */}
            {rows.length > 0 && (
                <div className="space-y-2.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar atleta"
                            className="h-10 rounded-full pl-10 pr-9"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
                        {FILTERS.map(option => {
                            const count = countFor(option.value)
                            if (option.value !== 'all' && option.value !== 'due' && count === 0) return null
                            const active = filter === option.value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFilter(option.value)}
                                    className={cn(
                                        'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                                        active ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {option.label}
                                    <span className={cn('tabular-nums', active ? 'text-background/70' : 'text-muted-foreground/70')}>{count}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {bulkIds.length >= 2 && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/40 px-4 py-2.5">
                    <p className="min-w-0 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{bulkIds.length} pendientes</span> en la lista · {money(bulkAmount)}
                    </p>
                    <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full" onClick={() => { setBulkMethod(null); setBulkOpen(true) }}>
                        <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                        Cobrar todos
                    </Button>
                </div>
            )}

            {/* Lista */}
            {rows.length === 0 ? (
                <CatalogEmpty
                    icon={Receipt}
                    title={isFuture ? 'Mes aún sin cobros' : 'Sin cobros este mes'}
                    description={isFuture
                        ? 'Cuando empiece el mes aparecerán los cobros de los atletas con cuota. Puedes registrar un pago adelantado.'
                        : 'Ningún atleta tenía cuota en este mes. Puedes registrar un cobro manual.'}
                />
            ) : visibleRows.length === 0 ? (
                <CatalogEmpty icon={Search} title="Nadie coincide" description="Prueba con otro filtro o búsqueda." />
            ) : (
                <CatalogList>
                    {visibleRows.map(row => (
                        <BillingRow
                            key={row.key}
                            row={row}
                            today={today}
                            money={money}
                            busy={busyKey === row.key}
                            onCharge={method => charge(row, method)}
                            onSetStatus={(status, message) => setStatus(row, status, message)}
                            onEdit={(status) => row.record
                                ? onOpenRecord({ mode: 'edit', record: row.record, clientName: row.name, status })
                                : onOpenRecord({ mode: 'create', year, month, clientId: row.clientId, amount: row.amount, status })}
                            onFee={() => {
                                const client = clients.find(c => c.id === row.clientId)
                                if (client) onOpenFee(client)
                            }}
                        />
                    ))}
                </CatalogList>
            )}

            <AlertDialog open={bulkOpen} onOpenChange={open => !bulkSaving && setBulkOpen(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cobrar {bulkIds.length} pagos</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se marcarán como cobrados los {bulkIds.length} pendientes de la lista ({money(bulkAmount)}) con fecha de hoy.
                            {visibleMissing > 0 && ` Los ${visibleMissing} «sin registrar» se cobran uno a uno.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex flex-wrap gap-1.5">
                        {[null, ...PAYMENT_METHODS].map(option => (
                            <button
                                key={option ?? 'none'}
                                type="button"
                                onClick={() => setBulkMethod(option)}
                                className={cn(
                                    'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                                    bulkMethod === option ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {option ?? 'Sin indicar método'}
                            </button>
                        ))}
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={bulkSaving}>Cancelar</AlertDialogCancel>
                        <Button onClick={runBulk} disabled={bulkSaving}>
                            {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Marcar cobrados
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function rowDetail(row: MonthRow, today: string) {
    switch (row.state) {
        case 'paid': {
            const parts = [row.record?.paid_at ? `Cobrado el ${formatDayMonth(row.record.paid_at)}` : 'Cobrado']
            if (row.record?.payment_method) parts.push(row.record.payment_method)
            return parts.join(' · ')
        }
        case 'pending':
            return row.dueDate === today ? 'Vence hoy' : `Vence el ${formatDayMonth(row.dueDate)}`
        case 'overdue':
            return `Vencido hace ${row.daysLate} ${row.daysLate === 1 ? 'día' : 'días'}`
        case 'missing':
            return row.daysLate > 0 ? `Sin registrar · vencía el ${formatDayMonth(row.dueDate)}` : `Sin registrar · vence el ${formatDayMonth(row.dueDate)}`
        case 'waived':
            return 'Exento este mes'
    }
}

function BillingRow({
    row,
    today,
    money,
    busy,
    onCharge,
    onSetStatus,
    onEdit,
    onFee,
}: {
    row: MonthRow
    today: string
    money: (value: number) => string
    busy: boolean
    onCharge: (method: string | null) => void
    onSetStatus: (status: PaymentStatus, message: string) => void
    onEdit: (status?: PaymentStatus) => void
    onFee: () => void
}) {
    const meta = STATE_META[row.state]
    const chargeable = row.state === 'pending' || row.state === 'overdue' || row.state === 'missing'

    return (
        <li className={cn('flex items-center gap-3 px-4 py-3', row.state === 'waived' && 'opacity-70')}>
            <div className="relative shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {initialsOf(row.name)}
                </div>
                <span className={cn('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card', meta.dot)} />
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
                        <span className="truncate">{row.name}</span>
                        {!row.clientActive && (
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">De baja</span>
                        )}
                    </p>
                    <p className={cn('shrink-0 text-sm font-semibold tabular-nums', row.state === 'waived' && 'text-muted-foreground line-through')}>
                        {money(row.amount)}
                    </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                    <p className={cn(
                        'min-w-0 truncate text-xs',
                        row.state === 'overdue' ? 'font-medium text-destructive' : 'text-muted-foreground',
                    )}>
                        {rowDetail(row, today)}
                        {row.record?.notes && <span className="text-muted-foreground"> · {row.record.notes}</span>}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                        {busy ? (
                            <Loader2 className="mx-2 h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                            <>
                                {chargeable && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className={cn(
                                                    'h-8 rounded-full px-2.5 text-xs font-semibold',
                                                    row.state === 'overdue'
                                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                                                        : 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                                                )}
                                            >
                                                <Check className="mr-1 h-3.5 w-3.5" />
                                                Cobrar
                                                <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Cobrado hoy por…</DropdownMenuLabel>
                                            {PAYMENT_METHODS.map(method => (
                                                <DropdownMenuItem key={method} onSelect={() => onCharge(method)}>{method}</DropdownMenuItem>
                                            ))}
                                            <DropdownMenuItem onSelect={() => onCharge(null)}>Sin indicar</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => onEdit('paid')}>Otra fecha o importe…</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground" aria-label={`Más acciones para ${row.name}`}>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52">
                                        {row.record && <DropdownMenuItem onSelect={() => onEdit()}>Editar cobro…</DropdownMenuItem>}
                                        {row.state === 'missing' && (
                                            <DropdownMenuItem onSelect={() => onSetStatus('pending', `${row.name}: registrado como pendiente`)}>
                                                Registrar como pendiente
                                            </DropdownMenuItem>
                                        )}
                                        {row.state === 'paid' && (
                                            <DropdownMenuItem onSelect={() => onSetStatus('pending', `${row.name}: cobro deshecho`)}>
                                                Deshacer cobro
                                            </DropdownMenuItem>
                                        )}
                                        {row.state === 'waived' ? (
                                            <DropdownMenuItem onSelect={() => onSetStatus('pending', `${row.name}: ya no está exento`)}>
                                                Quitar exención
                                            </DropdownMenuItem>
                                        ) : row.state !== 'paid' && (
                                            <DropdownMenuItem onSelect={() => onSetStatus('waived', `${row.name}: exento este mes`)}>
                                                Eximir este mes
                                            </DropdownMenuItem>
                                        )}
                                        {row.clientActive && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onSelect={onFee}>Cambiar cuota o día de cobro…</DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </li>
    )
}
