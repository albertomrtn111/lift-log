'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingClientOption, BillingDashboardData, PaymentRecord } from '@/types/billing'
import {
    createManualPaymentAction,
    generateMonthlyRecordsAction,
    markVisibleMonthRecordsPaidAction,
    updatePaymentStatusAction,
} from './billing-actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Receipt,
    CheckCircle2,
    Clock,
    Users,
    ArrowUpRight,
    ArrowDownRight,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Calendar as CalendarIcon,
    FileX,
    CreditCard,
    Plus,
    Search,
    Filter,
    CheckCheck,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipProps } from 'recharts'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface BillingPageClientProps {
    coachId: string
    initialYear: number
    initialMonth: number
    initialData: BillingDashboardData
    annualComparison: {
        currentYear: number
        previousYear: number
        growth: number
    }
    clientOptions: BillingClientOption[]
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const FULL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const STATUS_CONFIG = {
    paid: { label: 'Pagado', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    pending: { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    overdue: { label: 'Vencido', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
    waived: { label: 'Exento', color: 'bg-muted text-muted-foreground border-transparent' },
} as const

const STATUS_FILTER_OPTIONS = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'overdue', label: 'Vencidos' },
    { value: 'paid', label: 'Pagados' },
    { value: 'waived', label: 'Exentos' },
] as const

type ViewMode = 'monthly' | 'annual'
type StatusFilter = typeof STATUS_FILTER_OPTIONS[number]['value']

type ManualPaymentForm = {
    clientId: string
    period: string
    amount: string
    status: 'pending' | 'paid' | 'overdue' | 'waived'
    paymentMethod: string
    paidAt: string
    notes: string
}

const defaultManualForm: ManualPaymentForm = {
    clientId: '',
    period: '',
    amount: '',
    status: 'pending',
    paymentMethod: '',
    paidAt: '',
    notes: '',
}

function toMonthInputValue(year: number, month: number) {
    return `${year}-${String(month).padStart(2, '0')}`
}

function getNowPeriod() {
    const now = new Date()
    return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
    }
}

function BillingChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null

    const collected = payload.find((entry) => entry.dataKey === 'Cobrado')?.value ?? 0
    const pending = payload.find((entry) => entry.dataKey === 'Pendiente')?.value ?? 0

    return (
        <div className="min-w-[180px] rounded-xl border border-border bg-background px-4 py-3 shadow-xl">
            <p className="text-sm font-semibold">{label}</p>
            <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        Cobrado
                    </span>
                    <span className="font-semibold text-foreground">{Number(collected).toFixed(2)}€</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        Pendiente
                    </span>
                    <span className="font-semibold text-foreground">{Number(pending).toFixed(2)}€</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold text-foreground">{(Number(collected) + Number(pending)).toFixed(2)}€</span>
                </div>
            </div>
        </div>
    )
}

export default function BillingPageClient({
    coachId,
    initialYear,
    initialMonth,
    initialData,
    annualComparison: initialAnnualComparison,
    clientOptions,
}: BillingPageClientProps) {
    const router = useRouter()
    const { toast } = useToast()

    const [viewMode, setViewMode] = useState<ViewMode>('monthly')
    const [period, setPeriod] = useState({ year: initialYear, month: initialMonth })
    const [data, setData] = useState<BillingDashboardData>(initialData)
    const [isLoading, setIsLoading] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [manualDialogOpen, setManualDialogOpen] = useState(false)
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
    const [manualForm, setManualForm] = useState<ManualPaymentForm>({
        ...defaultManualForm,
        period: toMonthInputValue(initialYear, initialMonth),
    })
    const [bulkPaymentMethod, setBulkPaymentMethod] = useState('')

    const fetchBillingData = useCallback(async (year: number, month: number): Promise<BillingDashboardData | null> => {
        try {
            const res = await fetch(`/api/billing-data?year=${year}&month=${month}`)
            if (!res.ok) return null
            const json = await res.json()
            if (!json.data || !Array.isArray(json.data.yearTotals) || !Array.isArray(json.data.records)) return null
            return json.data as BillingDashboardData
        } catch {
            return null
        }
    }, [])

    const loadPeriod = useCallback(async (
        nextYear: number,
        nextMonth: number,
        nextViewMode: ViewMode = viewMode,
    ) => {
        setIsLoading(true)
        const freshData = await fetchBillingData(nextYear, nextMonth)
        if (freshData) {
            setData(freshData)
            setPeriod({ year: nextYear, month: nextMonth })
            setViewMode(nextViewMode)
            router.replace(`/coach/billing?year=${nextYear}&month=${nextMonth}`, { scroll: false })
        } else {
            toast({ title: 'Error', description: 'No se pudieron cargar los datos de facturación.', variant: 'destructive' })
        }
        setIsLoading(false)
    }, [fetchBillingData, router, toast, viewMode])

    const handlePrevMonth = () => {
        const nextMonth = period.month === 1 ? 12 : period.month - 1
        const nextYear = period.month === 1 ? period.year - 1 : period.year
        loadPeriod(nextYear, nextMonth, 'monthly')
    }

    const handleNextMonth = () => {
        const nextMonth = period.month === 12 ? 1 : period.month + 1
        const nextYear = period.month === 12 ? period.year + 1 : period.year
        loadPeriod(nextYear, nextMonth, 'monthly')
    }

    const handlePrevYear = () => loadPeriod(period.year - 1, period.month, 'annual')
    const handleNextYear = () => loadPeriod(period.year + 1, period.month, 'annual')

    const handleToday = () => {
        const now = getNowPeriod()
        loadPeriod(now.year, now.month, 'monthly')
    }

    const handleMonthSelect = (value: string) => {
        loadPeriod(period.year, Number(value), 'monthly')
    }

    const handleYearSelect = (value: string) => {
        loadPeriod(Number(value), period.month, viewMode)
    }

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode)
        router.replace(`/coach/billing?year=${period.year}&month=${period.month}`, { scroll: false })
    }

    const handleGenerateRecords = async () => {
        setIsGenerating(true)
        try {
            const result = await generateMonthlyRecordsAction(coachId, period.year, period.month)
            if (!result.success) {
                throw new Error(result.error || 'No se pudieron generar los registros.')
            }
            const freshData = await fetchBillingData(period.year, period.month)
            if (freshData) {
                setData(freshData)
            }
            toast({
                title: 'Registros actualizados',
                description: (result.generatedCount ?? 0) > 0
                    ? `Se autogeneraron ${result.generatedCount ?? 0} registros para ${FULL_MONTHS[period.month - 1]}.`
                    : 'No había nuevos registros por generar en este periodo.',
            })
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleStatusChange = async (
        recordId: string,
        newStatus: 'paid' | 'pending' | 'overdue' | 'waived',
        oldStatus: PaymentRecord['status'],
        paymentMethod?: string
    ) => {
        if (newStatus === oldStatus) return

        const backupData = { ...data }
        setData(prev => {
            const records = prev.records.map(record =>
                record.id === recordId
                    ? {
                        ...record,
                        status: newStatus,
                        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
                        payment_method: newStatus === 'paid' ? (paymentMethod ?? record.payment_method ?? null) : null,
                    }
                    : record
            )
            const totalCollected = records.filter(record => record.status === 'paid').reduce((sum, record) => sum + Number(record.amount), 0)
            const totalPending = records.filter(record => record.status === 'pending' || record.status === 'overdue').reduce((sum, record) => sum + Number(record.amount), 0)
            return {
                ...prev,
                records,
                summary: {
                    ...prev.summary,
                    totalCollected,
                    totalPending,
                },
            }
        })

        const result = await updatePaymentStatusAction(recordId, newStatus, paymentMethod)
        if (!result.success) {
            setData(backupData)
            toast({ title: 'Error', description: result.error || 'No se pudo actualizar el estado.', variant: 'destructive' })
            return
        }

        const freshData = await fetchBillingData(period.year, period.month)
        if (freshData) setData(freshData)
        toast({ title: 'Estado actualizado', description: 'El registro de pago se ha guardado correctamente.' })
    }

    const handleCreateManualPayment = async () => {
        if (!manualForm.clientId || !manualForm.period || !manualForm.amount) {
            toast({ title: 'Faltan datos', description: 'Completa cliente, periodo e importe.', variant: 'destructive' })
            return
        }

        const [yearStr, monthStr] = manualForm.period.split('-')
        const year = Number(yearStr)
        const month = Number(monthStr)
        const amount = Number(manualForm.amount)

        if (!year || !month || month < 1 || month > 12 || !amount || amount <= 0) {
            toast({ title: 'Datos inválidos', description: 'Revisa el periodo y el importe.', variant: 'destructive' })
            return
        }

        const result = await createManualPaymentAction({
            clientId: manualForm.clientId,
            year,
            month,
            amount,
            status: manualForm.status,
            paymentMethod: manualForm.status === 'paid' ? manualForm.paymentMethod || null : null,
            paidAt: manualForm.status === 'paid' && manualForm.paidAt ? `${manualForm.paidAt}T12:00:00.000Z` : null,
            notes: manualForm.notes || null,
        })

        if (!result.success) {
            toast({ title: 'Error al registrar pago', description: result.error || 'No se pudo guardar el pago manual.', variant: 'destructive' })
            return
        }

        toast({ title: 'Pago registrado', description: 'El pago manual se ha añadido correctamente.' })
        setManualDialogOpen(false)
        setManualForm({ ...defaultManualForm, period: toMonthInputValue(period.year, period.month) })

        if (year === period.year && month === period.month) {
            const freshData = await fetchBillingData(period.year, period.month)
            if (freshData) setData(freshData)
        }
    }

    const handleMarkAllVisiblePaid = async () => {
        const result = await markVisibleMonthRecordsPaidAction({
            year: period.year,
            month: period.month,
            search,
            statusFilter: statusFilter === 'all' || statusFilter === 'paid' || statusFilter === 'waived'
                ? 'all'
                : statusFilter,
            paymentMethod: bulkPaymentMethod || null,
        })

        if (!result.success) {
            toast({ title: 'Error', description: result.error || 'No se pudieron actualizar los pagos visibles.', variant: 'destructive' })
            return
        }

        const freshData = await fetchBillingData(period.year, period.month)
        if (freshData) setData(freshData)

        toast({
            title: 'Pagos actualizados',
            description: (result.updatedCount ?? 0) > 0
                ? `Se marcaron ${result.updatedCount ?? 0} pagos visibles como cobrados.`
                : 'No había pagos pendientes visibles que marcar.',
        })
        setBulkDialogOpen(false)
        setBulkPaymentMethod('')
    }

    const chartData = useMemo(() => (data?.yearTotals ?? []).map(total => ({
        name: MONTHS[total.month - 1],
        Cobrado: total.collected,
        Pendiente: total.pending,
    })), [data?.yearTotals])

    const filteredRecords = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase()
        return [...(data?.records ?? [])]
            .filter(record => {
                const matchesSearch = !normalizedSearch
                    || (record.full_name || '').toLowerCase().includes(normalizedSearch)
                    || (record.email || '').toLowerCase().includes(normalizedSearch)
                const matchesStatus = statusFilter === 'all' ? true : record.status === statusFilter
                return matchesSearch && matchesStatus
            })
            .sort((a, b) => {
                const orderWeight = { overdue: 0, pending: 1, paid: 2, waived: 3 }
                const weightDiff = orderWeight[a.status] - orderWeight[b.status]
                if (weightDiff !== 0) return weightDiff
                return (a.full_name || '').localeCompare(b.full_name || '')
            })
    }, [data?.records, search, statusFilter])

    const visiblePendingCount = filteredRecords.filter(record => record.status === 'pending' || record.status === 'overdue').length
    const annualCollected = (data?.yearTotals ?? []).reduce((sum, month) => sum + month.collected, 0)
    const annualPending = (data?.yearTotals ?? []).reduce((sum, month) => sum + month.pending, 0)
    const annualComparison = period.year === initialYear
        ? initialAnnualComparison
        : {
            currentYear: annualCollected,
            previousYear: data.previousYearTotal,
            growth: data.previousYearTotal > 0
                ? Math.round(((annualCollected - data.previousYearTotal) / data.previousYearTotal) * 1000) / 10
                : (annualCollected > 0 ? 100 : 0),
        }

    const yearOptions = Array.from(new Set([
        initialYear - 2,
        initialYear - 1,
        initialYear,
        initialYear + 1,
        initialYear + 2,
        getNowPeriod().year,
        period.year,
    ])).sort((a, b) => a - b)

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                        <Receipt className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
                        <p className="text-sm text-muted-foreground">
                            Gestiona cobros, histórico y lectura anual del negocio desde una misma vista.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center space-x-1 rounded-xl bg-muted/50 p-1">
                        <Button variant={viewMode === 'monthly' ? 'secondary' : 'ghost'} size="sm" onClick={() => handleViewModeChange('monthly')}>
                            Mensual
                        </Button>
                        <Button variant={viewMode === 'annual' ? 'secondary' : 'ghost'} size="sm" onClick={() => handleViewModeChange('annual')}>
                            Anual
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border bg-background px-2 py-2 shadow-sm">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={viewMode === 'monthly' ? handlePrevMonth : handlePrevYear} disabled={isLoading}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="flex items-center gap-2">
                            {viewMode === 'monthly' && (
                                <Select value={String(period.month)} onValueChange={handleMonthSelect}>
                                    <SelectTrigger className="h-9 w-[150px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {FULL_MONTHS.map((monthName, index) => (
                                            <SelectItem key={monthName} value={String(index + 1)}>
                                                {monthName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            <Select value={String(period.year)} onValueChange={handleYearSelect}>
                                <SelectTrigger className="h-9 w-[110px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearOptions.map((yearOption) => (
                                        <SelectItem key={yearOption} value={String(yearOption)}>
                                            {yearOption}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={viewMode === 'monthly' ? handleNextMonth : handleNextYear} disabled={isLoading}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" onClick={handleToday} disabled={isLoading}>
                        Hoy
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {viewMode === 'monthly' ? (
                    <>
                        <BillingKpiCard icon={CheckCircle2} label="Cobrado" value={`${data.summary.totalCollected.toFixed(2)}€`} tone="success" />
                        <BillingKpiCard icon={Clock} label="Pendiente" value={`${data.summary.totalPending.toFixed(2)}€`} tone="warning" />
                        <BillingKpiCard icon={Receipt} label="Total mes" value={`${(data.summary.totalCollected + data.summary.totalPending).toFixed(2)}€`} />
                        <BillingKpiCard icon={Users} label="Cobrables" value={String(data.summary.clientCount)} />
                    </>
                ) : (
                    <>
                        <BillingKpiCard icon={CheckCircle2} label="Cobrado año" value={`${annualCollected.toFixed(2)}€`} tone="success" />
                        <BillingKpiCard icon={Clock} label="Pendiente año" value={`${annualPending.toFixed(2)}€`} tone="warning" />
                        <BillingKpiCard icon={CalendarIcon} label="Proyección" value={`${data.summary.totalProjected.toFixed(2)}€`} />
                        <Card className="rounded-2xl border border-border shadow-sm">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">Interanual</span>
                                    {annualComparison.growth > 0 ? (
                                        <Badge className="border-0 bg-emerald-500/10 text-emerald-600">
                                            <ArrowUpRight className="mr-1 h-3 w-3" />
                                            {annualComparison.growth}%
                                        </Badge>
                                    ) : annualComparison.growth < 0 ? (
                                        <Badge className="border-0 bg-rose-500/10 text-rose-600">
                                            <ArrowDownRight className="mr-1 h-3 w-3" />
                                            {Math.abs(annualComparison.growth)}%
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary">0%</Badge>
                                    )}
                                </div>
                                <div className="mt-4 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Este año</span>
                                        <span className="font-semibold">{annualComparison.currentYear.toFixed(2)}€</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Año anterior</span>
                                        <span>{annualComparison.previousYear.toFixed(2)}€</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {viewMode === 'monthly' ? (
                <Card className="rounded-2xl border border-border shadow-sm">
                    <CardHeader className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <CardTitle>Pagos del periodo</CardTitle>
                            <CardDescription>
                                Gestiona cobros, histórico y estado de los registros visibles del mes.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => setManualDialogOpen(true)}>
                                <Plus className="h-4 w-4" />
                                Añadir pago manual
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="gap-2"
                                onClick={() => setBulkDialogOpen(true)}
                                disabled={visiblePendingCount === 0}
                            >
                                <CheckCheck className="h-4 w-4" />
                                Marcar visibles cobrados
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleGenerateRecords} disabled={isGenerating || isLoading} className="gap-2">
                                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                Autogenerar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                                <div className="relative max-w-md flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Buscar por cliente o email"
                                        className="pl-9"
                                    />
                                </div>
                                <div className="w-full sm:w-[190px]">
                                    <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                                        <SelectTrigger className="gap-2">
                                            <Filter className="h-4 w-4 text-muted-foreground" />
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_FILTER_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {filteredRecords.length} registro{filteredRecords.length !== 1 ? 's' : ''} visibles · {visiblePendingCount} pendiente{visiblePendingCount !== 1 ? 's' : ''}
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : filteredRecords.length === 0 ? (
                            <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                    <FileX className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-medium">No hay registros para esta vista</h3>
                                <p className="text-muted-foreground text-sm max-w-sm">
                                    Ajusta los filtros, navega a otro periodo o crea un pago manual histórico si necesitas completar el pasado.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border">
                                <table className="w-full min-w-[900px] text-sm">
                                    <thead className="border-b bg-muted/40 text-left">
                                        <tr>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Periodo</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Importe</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Método</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Fecha cobro</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {filteredRecords.map((record) => (
                                            <tr key={record.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{record.full_name}</div>
                                                    <div className="text-xs text-muted-foreground">{record.email}</div>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {FULL_MONTHS[record.month - 1]} {record.year}
                                                </td>
                                                <td className="px-4 py-3 font-semibold">{Number(record.amount).toFixed(2)}€</td>
                                                <td className="px-4 py-3">
                                                    <Select
                                                        value={record.status}
                                                        onValueChange={(value: PaymentRecord['status']) => handleStatusChange(record.id, value, record.status, record.payment_method || 'Transferencia')}
                                                    >
                                                        <SelectTrigger className={cn('h-9 w-[140px] border text-xs font-semibold shadow-none', STATUS_CONFIG[record.status].color)}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="pending">Pendiente</SelectItem>
                                                            <SelectItem value="paid">Pagado</SelectItem>
                                                            <SelectItem value="overdue">Vencido</SelectItem>
                                                            <SelectItem value="waived">Exento</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{record.payment_method || '—'}</td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {record.paid_at ? new Date(record.paid_at).toLocaleDateString('es-ES') : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground max-w-[220px]">
                                                    <span className="line-clamp-2">{record.notes || '—'}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <Card className="rounded-2xl border border-border shadow-sm">
                    <CardHeader>
                        <CardTitle>Evolución de cobros — {period.year}</CardTitle>
                        <CardDescription>
                            Comparativa mensual entre cobrado y pendiente con tooltip limpio y lectura anual más estable.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="h-[360px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 12, right: 18, left: 6, bottom: 0 }} barCategoryGap={18}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                        tickFormatter={(value) => `${value}€`}
                                    />
                                    <Tooltip content={<BillingChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.15 }} />
                                    <Bar dataKey="Cobrado" fill="#10b981" radius={[8, 8, 0, 0]} maxBarSize={22} />
                                    <Bar dataKey="Pendiente" fill="#f59e0b" radius={[8, 8, 0, 0]} maxBarSize={22} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="flex flex-wrap gap-3 text-sm">
                            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                Cobrado
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                Pendiente
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full min-w-[620px] text-sm text-right">
                                <thead className="border-b bg-muted/40">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mes</th>
                                        <th className="px-4 py-3 font-medium text-emerald-600">Cobrado</th>
                                        <th className="px-4 py-3 font-medium text-amber-600">Pendiente</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.yearTotals.map((total) => (
                                        <tr key={total.month} className="hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3 text-left font-medium">{FULL_MONTHS[total.month - 1]}</td>
                                            <td className="px-4 py-3">{total.collected.toFixed(2)}€</td>
                                            <td className="px-4 py-3">{total.pending.toFixed(2)}€</td>
                                            <td className="px-4 py-3 text-muted-foreground">{total.total.toFixed(2)}€</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-muted/50 font-semibold">
                                        <td className="px-4 py-3 text-left">TOTAL {period.year}</td>
                                        <td className="px-4 py-3 text-emerald-600">{annualCollected.toFixed(2)}€</td>
                                        <td className="px-4 py-3 text-amber-600">{annualPending.toFixed(2)}€</td>
                                        <td className="px-4 py-3">{(annualCollected + annualPending).toFixed(2)}€</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
                <DialogContent className="sm:max-w-[620px]">
                    <DialogHeader>
                        <DialogTitle>Añadir pago manual</DialogTitle>
                        <DialogDescription>
                            Registra histórico real, también para meses o años anteriores al primer ciclo autogenerado.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2 sm:grid-cols-2">
                        <div className="sm:col-span-2 space-y-2">
                            <Label>Cliente</Label>
                            <Select value={manualForm.clientId} onValueChange={(value) => setManualForm(prev => ({ ...prev, clientId: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un cliente" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientOptions.map((client) => (
                                        <SelectItem key={client.id} value={client.id}>
                                            {client.full_name} {client.email ? `· ${client.email}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Periodo</Label>
                            <Input
                                type="month"
                                value={manualForm.period}
                                onChange={(event) => setManualForm(prev => ({ ...prev, period: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Importe</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={manualForm.amount}
                                onChange={(event) => setManualForm(prev => ({ ...prev, amount: event.target.value }))}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Estado</Label>
                            <Select
                                value={manualForm.status}
                                onValueChange={(value: ManualPaymentForm['status']) => setManualForm(prev => ({ ...prev, status: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pendiente</SelectItem>
                                    <SelectItem value="paid">Pagado</SelectItem>
                                    <SelectItem value="overdue">Vencido</SelectItem>
                                    <SelectItem value="waived">Exento</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Método de pago</Label>
                            <Input
                                value={manualForm.paymentMethod}
                                onChange={(event) => setManualForm(prev => ({ ...prev, paymentMethod: event.target.value }))}
                                placeholder="Transferencia, Bizum, Efectivo..."
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Fecha de cobro</Label>
                            <Input
                                type="date"
                                value={manualForm.paidAt}
                                onChange={(event) => setManualForm(prev => ({ ...prev, paidAt: event.target.value }))}
                                disabled={manualForm.status !== 'paid'}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Nota opcional</Label>
                            <Textarea
                                value={manualForm.notes}
                                onChange={(event) => setManualForm(prev => ({ ...prev, notes: event.target.value }))}
                                placeholder="Ej. pago cargado manualmente al incorporar histórico del cliente"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setManualDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleCreateManualPayment}>
                            Guardar pago
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Marcar visibles como cobrados</DialogTitle>
                        <DialogDescription>
                            Se marcarán como pagados los registros pendientes o vencidos que ahora mismo ves en la tabla del mes.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                            <p>
                                Periodo: <span className="font-medium text-foreground">{FULL_MONTHS[period.month - 1]} {period.year}</span>
                            </p>
                            <p className="mt-1">
                                Registros afectados: <span className="font-medium text-foreground">{visiblePendingCount}</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Método de pago común</Label>
                            <Input
                                value={bulkPaymentMethod}
                                onChange={(event) => setBulkPaymentMethod(event.target.value)}
                                placeholder="Opcional: Transferencia, Bizum, Stripe..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleMarkAllVisiblePaid} disabled={visiblePendingCount === 0}>
                            Marcar todos cobrados
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function BillingKpiCard({
    icon: Icon,
    label,
    value,
    tone = 'default',
}: {
    icon: typeof Receipt
    label: string
    value: string
    tone?: 'default' | 'success' | 'warning'
}) {
    const toneMap = {
        default: 'text-primary bg-primary/10',
        success: 'text-emerald-600 bg-emerald-500/10',
        warning: 'text-amber-600 bg-amber-500/10',
    }[tone]

    return (
        <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className={cn('rounded-xl p-2', toneMap)}>
                        <Icon className="h-4 w-4" />
                    </div>
                    {label}
                </div>
                <div className="mt-4 text-3xl font-bold tracking-tight">{value}</div>
            </CardContent>
        </Card>
    )
}
