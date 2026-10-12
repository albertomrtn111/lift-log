'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { LedgerClient } from '@/lib/billing/ledger'
import type { BillingLedgerData } from '@/types/billing'
import { getBillingLedgerAction } from './billing-actions'
import { FeeDialog, PaymentRecordDialog, type RecordDialogTarget } from './BillingDialogs'
import { MONTH_LONG, MONTH_SHORT } from './billing-format'
import { MonthView } from './MonthView'
import { YearView } from './YearView'

type ViewMode = 'month' | 'year'

interface BillingPageClientProps {
    initialLedger: BillingLedgerData
    initialMonth: number
    initialView: ViewMode
}

export default function BillingPageClient({ initialLedger, initialMonth, initialView }: BillingPageClientProps) {
    const { toast } = useToast()
    const [ledger, setLedger] = useState(initialLedger)
    const [view, setView] = useState<ViewMode>(initialView)
    const [month, setMonth] = useState(initialMonth)
    const [loading, setLoading] = useState(false)
    const [recordTarget, setRecordTarget] = useState<RecordDialogTarget | null>(null)
    const [feeClient, setFeeClient] = useState<LedgerClient | null>(null)
    const requestRef = useRef(0)

    const year = ledger.year
    const todayYear = Number(ledger.today.slice(0, 4))
    const todayMonth = Number(ledger.today.slice(5, 7))
    const isTodayPeriod = view === 'month' ? year === todayYear && month === todayMonth : year === todayYear

    // Si el servidor vuelve a pintar (revalidate) con el mismo año, nos quedamos con lo nuevo
    useEffect(() => {
        setLedger(current => (current.year === initialLedger.year ? initialLedger : current))
    }, [initialLedger])

    // URL compartible sin recargar la página
    useEffect(() => {
        const params = new URLSearchParams({ view: view === 'year' ? 'anual' : 'mensual', year: String(year) })
        if (view === 'month') params.set('month', String(month))
        window.history.replaceState(window.history.state, '', `?${params.toString()}`)
    }, [view, year, month])

    const loadYear = useCallback(async (targetYear: number) => {
        const request = ++requestRef.current
        setLoading(true)
        const result = await getBillingLedgerAction(targetYear)
        if (request !== requestRef.current) return false
        setLoading(false)
        if (!result.success || !result.data) {
            toast({ title: 'No se pudo cargar la facturación', description: result.success ? undefined : result.error, variant: 'destructive' })
            return false
        }
        setLedger(result.data)
        return true
    }, [toast])

    const reload = useCallback(() => { void loadYear(year) }, [loadYear, year])

    const goTo = async (targetYear: number, targetMonth: number) => {
        if (targetYear !== year && !(await loadYear(targetYear))) return
        setMonth(targetMonth)
    }

    const shift = (delta: number) => {
        if (view === 'year') {
            void goTo(year + delta, month)
            return
        }
        const index = year * 12 + (month - 1) + delta
        void goTo(Math.floor(index / 12), (index % 12) + 1)
    }

    const periodLabel = view === 'month' ? `${MONTH_LONG[month - 1]} ${year}` : String(year)
    const shortPeriodLabel = view === 'month' ? `${MONTH_SHORT[month - 1]} ${year}` : String(year)

    return (
        <div className="min-h-screen pb-24 lg:pb-8">
            <CoachPageHeader
                eyebrow="Gestión"
                title="Facturación"
                description="Quién ha pagado, quién debe y cómo va el año."
                actions={
                    <Button
                        size="sm"
                        className="h-9 rounded-full px-3 sm:px-4"
                        onClick={() => setRecordTarget({ mode: 'create', year, month: view === 'month' ? month : (year === todayYear ? todayMonth : 1) })}
                    >
                        <Plus className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Registrar cobro</span>
                        <span className="sr-only sm:hidden">Registrar cobro</span>
                    </Button>
                }
            >
                <div className="flex items-center gap-2 sm:justify-between">
                    <ClientTabSwitcher
                        className="w-[7.5rem] shrink-0 sm:w-56"
                        value={view}
                        onValueChange={setView}
                        options={[
                            { value: 'month', label: 'Mes' },
                            { value: 'year', label: 'Año' },
                        ]}
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-full border border-border/70 bg-card p-0.5 shadow-sm sm:flex-none">
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={() => shift(-1)} disabled={loading} aria-label="Periodo anterior">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1 sm:w-44 sm:flex-none">
                            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            <span className="truncate text-sm font-semibold tabular-nums">
                                <span className="sm:hidden">{shortPeriodLabel}</span>
                                <span className="hidden sm:inline">{periodLabel}</span>
                            </span>
                        </div>
                        {!isTodayPeriod && (
                            <button
                                type="button"
                                onClick={() => void goTo(todayYear, todayMonth)}
                                disabled={loading}
                                className="h-7 shrink-0 rounded-full bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                            >
                                Hoy
                            </button>
                        )}
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={() => shift(1)} disabled={loading} aria-label="Periodo siguiente">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CoachPageHeader>

            <div className={cn('mx-auto max-w-6xl px-4 pt-4 transition-opacity lg:px-8 lg:pt-6', loading && 'pointer-events-none opacity-60')}>
                {view === 'month' ? (
                    <MonthView
                        ledger={ledger}
                        month={month}
                        onChanged={reload}
                        onOpenRecord={setRecordTarget}
                        onOpenFee={setFeeClient}
                    />
                ) : (
                    <YearView
                        ledger={ledger}
                        onOpenMonth={(target) => {
                            setMonth(target)
                            setView('month')
                            window.scrollTo({ top: 0 })
                        }}
                    />
                )}
            </div>

            <PaymentRecordDialog
                target={recordTarget}
                clients={ledger.clients}
                currency={ledger.currency}
                today={ledger.today}
                onOpenChange={open => !open && setRecordTarget(null)}
                onSaved={reload}
            />
            <FeeDialog
                client={feeClient}
                currency={ledger.currency}
                onOpenChange={open => !open && setFeeClient(null)}
                onSaved={reload}
            />
        </div>
    )
}
