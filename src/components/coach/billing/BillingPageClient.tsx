'use client'

import { useState, useEffect } from 'react'
import type { BillingDashboardData } from '@/types/billing'
import { generateMonthlyRecordsAction, updatePaymentStatusAction } from './billing-actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Receipt, CheckCircle2, Clock, Users, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, FileX, CreditCard } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
}

const MONTHS = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]

const FULL_MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const STATUS_CONFIG = {
    paid: { label: 'Pagado', color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20' },
    pending: { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20' },
    overdue: { label: 'Vencido', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border-rose-500/20' },
    waived: { label: 'Exento', color: 'bg-muted text-muted-foreground border-transparent' }
}

export default function BillingPageClient({
    coachId,
    initialYear,
    initialMonth,
    initialData,
    annualComparison: initialAnnualComparison
}: BillingPageClientProps) {
    const { toast } = useToast()
    const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly')
    
    // Time navigation state
    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)
    
    // Data state
    const [data, setData] = useState<BillingDashboardData>(initialData)
    const [isLoading, setIsLoading] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    
    const fetchBillingData = async (y: number, m: number): Promise<BillingDashboardData | null> => {
        try {
            const res = await fetch(`/api/billing-data?year=${y}&month=${m}`)
            if (!res.ok) return null
            const json = await res.json()
            // Validate shape before returning
            if (!json.data || !Array.isArray(json.data.yearTotals) || !Array.isArray(json.data.records)) return null
            return json.data as BillingDashboardData
        } catch {
            return null
        }
    }

    // Fetch data when year/month changes
    useEffect(() => {
        if (year === initialYear && month === initialMonth) return // Skip initial fetch
        
        const fetchData = async () => {
            setIsLoading(true)
            const freshData = await fetchBillingData(year, month)
            if (freshData) {
                setData(freshData)
            } else {
                toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' })
            }
            setIsLoading(false)
        }
        
        fetchData()
    }, [year, month, initialYear, initialMonth, toast])

    // Navigation handlers
    const handlePrevMonth = () => {
        if (month === 1) {
            setMonth(12)
            setYear(y => y - 1)
        } else {
            setMonth(m => m - 1)
        }
    }

    const handleNextMonth = () => {
        if (month === 12) {
            setMonth(1)
            setYear(y => y + 1)
        } else {
            setMonth(m => m + 1)
        }
    }

    const handleToday = () => {
        const now = new Date()
        setYear(now.getFullYear())
        setMonth(now.getMonth() + 1)
        setViewMode('monthly')
    }

    const handlePrevYear = () => setYear(y => y - 1)
    const handleNextYear = () => setYear(y => y + 1)

    // Actions
    const handleGenerateRecords = async () => {
        setIsGenerating(true)
        try {
            const result = await generateMonthlyRecordsAction(coachId, year, month)
            if (result.success) {
                toast({ title: 'Éxito', description: `Se autogeneraron ${result.generatedCount} registros del mes.` })
                // Refetch current month
                const freshData = await fetchBillingData(year, month)
                if (freshData) setData(freshData)
                else toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' })
            } else {
                throw new Error(result.error || 'Unknown error')
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleStatusChange = async (recordId: string, newStatus: 'paid' | 'pending' | 'overdue' | 'waived', oldStatus: string) => {
        if (newStatus === oldStatus) return
        
        // Optimistic update
        const backupData = { ...data }
        setData(prev => {
            const newRecords = prev.records.map(r => {
                if (r.id === recordId) {
                    return { ...r, status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null }
                }
                return r
            })
            // Quick recalculation for UI responsiveness
            const totalCollected = newRecords.filter(r => r.status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0)
            const totalPending = newRecords.filter(r => r.status === 'pending' || r.status === 'overdue').reduce((sum, r) => sum + Number(r.amount), 0)
            
            return {
                ...prev,
                summary: { ...prev.summary, totalCollected, totalPending },
                records: newRecords
            }
        })

        try {
            let paymentMethod = undefined
            if (newStatus === 'paid') {
                // In a real app we might want a modal here, for now it's simple
                const input = window.prompt('Método de pago (Bizum, Transferencia, Efectivo...)?', 'Transferencia')
                if (input !== null) {
                    paymentMethod = input
                } else {
                    // Cancelled prompt -> rollback
                    setData(backupData)
                    return
                }
            }
            
            const result = await updatePaymentStatusAction(recordId, newStatus, paymentMethod)
            if (!result.success) throw new Error(result.error)
                
            toast({ title: 'Estado actualizado', description: 'Registro guardado correctamente.' })
            
            // Full refresh to ensure consistency (esp yearTotals)
            const freshData = await fetchBillingData(year, month)
            if (freshData) setData(freshData)
            else toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' })
        } catch (err) {
            toast({ title: 'Error', description: 'No se pudo actualizar el estado', variant: 'destructive' })
            setData(backupData) // rollback
        }
    }

    // Chart formatting
    const chartData = (data?.yearTotals ?? []).map(t => ({
        name: MONTHS[t.month - 1],
        Cobrado: t.collected,
        Pendiente: t.pending
    }))

    // Sort records: pending/overdue first, then paid/waived
    const sortedRecords = [...(data?.records ?? [])].sort((a, b) => {
        const orderWeight = { overdue: 0, pending: 1, paid: 2, waived: 3 }
        const weightDiff = orderWeight[a.status] - orderWeight[b.status]
        if (weightDiff !== 0) return weightDiff
        return (a.full_name || '').localeCompare(b.full_name || '')
    })

    const annualCollected = (data?.yearTotals ?? []).reduce((sum, m) => sum + m.collected, 0)
    const annualPending = (data?.yearTotals ?? []).reduce((sum, m) => sum + m.pending, 0)
    
    // Re-calculate growth purely for this year vs initial comparison if we are not on initialYear
    // (A full implementation would fetch this per-year, but for simplicity we rely on the initial load 
    // or just show the totals fetched in yearTotals)
    const ac = year === initialYear ? initialAnnualComparison : {
        currentYear: annualCollected,
        previousYear: data.previousYearTotal,
        growth: data.previousYearTotal > 0 ? Math.round(((annualCollected - data.previousYearTotal) / data.previousYearTotal) * 1000) / 10 : (annualCollected > 0 ? 100 : 0)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Receipt className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
                        <p className="text-muted-foreground text-sm">Control de pagos y métricas financieras</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2 bg-muted/50 p-1 rounded-lg">
                        <Button 
                            variant={viewMode === 'monthly' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onClick={() => setViewMode('monthly')}
                            className="text-xs"
                        >
                            Mensual
                        </Button>
                        <Button 
                            variant={viewMode === 'annual' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onClick={() => setViewMode('annual')}
                            className="text-xs"
                        >
                            Anual
                        </Button>
                    </div>

                    <div className="flex items-center gap-1 bg-background border rounded-lg p-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={viewMode === 'monthly' ? handlePrevMonth : handlePrevYear}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-[120px] text-center font-medium text-sm">
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                            ) : (
                                viewMode === 'monthly' ? `${FULL_MONTHS[month - 1]} ${year}` : `Año ${year}`
                            )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={viewMode === 'monthly' ? handleNextMonth : handleNextYear}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" onClick={handleToday} className="hidden sm:flex">
                        Hoy
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {viewMode === 'monthly' ? (
                    <>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    Cobrado
                                </div>
                                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {data.summary.totalCollected.toFixed(2)}€
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    Pendiente
                                </div>
                                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                                    {data.summary.totalPending.toFixed(2)}€
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <Receipt className="w-4 h-4 text-blue-500" />
                                    Total Mes
                                </div>
                                <div className="text-3xl font-bold">
                                    {(data.summary.totalCollected + data.summary.totalPending).toFixed(2)}€
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <Users className="w-4 h-4 text-primary" />
                                    Cobrables
                                </div>
                                <div className="text-3xl font-bold">{data.summary.clientCount}</div>
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <>
                         <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    Total Año
                                </div>
                                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {annualCollected.toFixed(2)}€
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    Pendiente Año
                                </div>
                                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                                    {annualPending.toFixed(2)}€
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <CalendarIcon className="w-4 h-4 text-blue-500" />
                                    Proyectado Anual
                                </div>
                                <div className="text-3xl font-bold">
                                    {data.summary.totalProjected.toFixed(2)}€
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between text-sm font-medium text-muted-foreground mb-2">
                                    <span>Crecimiento Interanual</span>
                                    {ac.growth > 0 ? (
                                        <Badge className="bg-emerald-500/10 text-emerald-600 border-0 flex gap-1 px-1"><ArrowUpRight className="w-3 h-3"/> {ac.growth}%</Badge>
                                    ) : ac.growth < 0 ? (
                                        <Badge className="bg-rose-500/10 text-rose-600 border-0 flex gap-1 px-1"><ArrowDownRight className="w-3 h-3"/> {Math.abs(ac.growth)}%</Badge>
                                    ) : (
                                        <Badge variant="secondary" className="border-0">0%</Badge>
                                    )}
                                </div>
                                <div className="mt-4 text-sm text-muted-foreground space-y-1">
                                    <div className="flex justify-between">
                                        <span>Este año:</span>
                                        <span className="font-semibold text-foreground">{ac.currentYear.toFixed(2)}€</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Año anterior:</span>
                                        <span>{ac.previousYear.toFixed(2)}€</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Main Content */}
            {viewMode === 'monthly' ? (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <div>
                            <CardTitle>Pagos del Mes</CardTitle>
                            <CardDescription>Visualiza y actualiza el estado de las cuotas mensuales.</CardDescription>
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleGenerateRecords}
                            disabled={isGenerating || isLoading}
                            className="gap-2"
                        >
                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                            Autogenerar Registros
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {data.records.length === 0 ? (
                            <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                    <FileX className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-medium">No hay registros este mes</h3>
                                <p className="text-muted-foreground text-sm max-w-sm">
                                    Puedes generar automáticamente los recibos de pago del mes para todos los clientes activos con cuota configurada.
                                </p>
                                <Button className="mt-2" onClick={handleGenerateRecords} disabled={isGenerating}>
                                    Generar {FULL_MONTHS[month - 1]}
                                </Button>
                            </div>
                        ) : (
                            <div className="border rounded-md overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Cuota</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Método</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {sortedRecords.map((record) => (
                                            <tr key={record.id} className="group hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{record.full_name}</div>
                                                    <div className="text-xs text-muted-foreground">{record.email}</div>
                                                </td>
                                                <td className="px-4 py-3 font-medium">{Number(record.amount).toFixed(2)}€</td>
                                                <td className="px-4 py-3">
                                                    <Select
                                                        value={record.status}
                                                        onValueChange={(val: any) => handleStatusChange(record.id, val, record.status)}
                                                    >
                                                        <SelectTrigger className={cn("h-8 w-[130px] text-xs font-semibold border shadow-none", STATUS_CONFIG[record.status].color)}>
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
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {record.payment_method || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {record.paid_at ? new Date(record.paid_at).toLocaleDateString() : '-'}
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
                <Card>
                    <CardHeader>
                        <CardTitle>Evolución de Pagos — {year}</CardTitle>
                        <CardDescription>Desglose mensual de ingresos cobrados frente a cuotas pendientes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" className="opacity-50" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} 
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                        tickFormatter={(value) => `${value}€`}
                                    />
                                    <Tooltip 
                                        cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}
                                        formatter={(value: number) => [`${value.toFixed(2)}€`, undefined]}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar dataKey="Cobrado" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="Pendiente" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="mt-12 border rounded-md overflow-x-auto">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mes</th>
                                        <th className="px-4 py-3 font-medium text-emerald-600">Cobrado</th>
                                        <th className="px-4 py-3 font-medium text-amber-600">Pendiente</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Total Proyectado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.yearTotals.map((t) => (
                                        <tr key={t.month} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3 text-left font-medium">{FULL_MONTHS[t.month - 1]}</td>
                                            <td className="px-4 py-3">{t.collected.toFixed(2)}€</td>
                                            <td className="px-4 py-3">{t.pending.toFixed(2)}€</td>
                                            <td className="px-4 py-3 text-muted-foreground">{t.total.toFixed(2)}€</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-muted/50 font-bold">
                                        <td className="px-4 py-3 text-left">TOTAL {year}</td>
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
        </div>
    )
}
