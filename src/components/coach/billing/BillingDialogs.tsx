'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { feeOf, type LedgerClient, type LedgerRecord } from '@/lib/billing/ledger'
import type { PaymentStatus } from '@/types/billing'
import { createPaymentRecordAction, updateClientFeeAction, updatePaymentRecordAction } from './billing-actions'
import { MONTH_LONG, PAYMENT_METHODS } from './billing-format'

const NO_METHOD = '__none__'

function parseAmount(value: string) {
    const amount = Number(value.replace(',', '.'))
    return Number.isFinite(amount) ? amount : NaN
}

// ---------------------------------------------------------------------------
// Cuota del atleta
// ---------------------------------------------------------------------------

export function FeeDialog({
    client,
    currency,
    onOpenChange,
    onSaved,
}: {
    client: LedgerClient | null
    currency: string
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const { toast } = useToast()
    const [amount, setAmount] = useState('')
    const [day, setDay] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!client) return
        const fee = feeOf(client)
        setAmount(fee > 0 ? String(fee).replace('.', ',') : '')
        setDay(client.payment_day ? String(client.payment_day) : '')
    }, [client])

    const save = async () => {
        if (!client) return
        const fee = amount.trim() ? parseAmount(amount) : null
        if (fee !== null && (Number.isNaN(fee) || fee < 0)) {
            toast({ title: 'Cuota no válida', variant: 'destructive' })
            return
        }
        const paymentDay = day.trim() ? Number(day) : null
        setSaving(true)
        const result = await updateClientFeeAction(client.id, fee, paymentDay)
        setSaving(false)
        if (!result.success) {
            toast({ title: 'No se pudo guardar', description: result.error, variant: 'destructive' })
            return
        }
        toast({ title: 'Cuota guardada', description: fee ? 'Ya cuenta en la facturación del mes.' : undefined })
        onSaved()
        onOpenChange(false)
    }

    return (
        <Dialog open={!!client} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Cuota de {client?.full_name || 'atleta'}</DialogTitle>
                    <DialogDescription>Lo que paga cada mes y el día en que vence el cobro.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="fee-amount">Cuota mensual ({currency === 'EUR' ? '€' : currency})</Label>
                        <Input id="fee-amount" inputMode="decimal" placeholder="Ej. 50" value={amount} onChange={e => setAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="fee-day">Día de cobro</Label>
                        <Input id="fee-day" type="number" min={1} max={31} placeholder="Fin de mes" value={day} onChange={e => setDay(e.target.value)} />
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Si no indicas día, el cobro vence el último día del mes. Se aplica al mes en curso si aún está pendiente.
                </p>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar cuota
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ---------------------------------------------------------------------------
// Registrar / editar un cobro
// ---------------------------------------------------------------------------

export type RecordDialogTarget =
    | { mode: 'create'; year: number; month: number; clientId?: string; amount?: number; status?: PaymentStatus }
    | { mode: 'edit'; record: LedgerRecord; clientName: string; status?: PaymentStatus }

export function PaymentRecordDialog({
    target,
    clients,
    currency,
    today,
    onOpenChange,
    onSaved,
}: {
    target: RecordDialogTarget | null
    clients: LedgerClient[]
    currency: string
    today: string
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const { toast } = useToast()
    const [clientId, setClientId] = useState('')
    const [month, setMonth] = useState(1)
    const [amount, setAmount] = useState('')
    const [status, setStatus] = useState<PaymentStatus>('paid')
    const [method, setMethod] = useState<string>(NO_METHOD)
    const [paidDate, setPaidDate] = useState(today)
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!target) return
        if (target.mode === 'create') {
            const client = clients.find(c => c.id === target.clientId)
            setClientId(target.clientId ?? '')
            setMonth(target.month)
            setAmount(String(target.amount ?? (client ? feeOf(client) || '' : '')).replace('.', ','))
            setStatus(target.status ?? 'paid')
            setMethod(NO_METHOD)
            setPaidDate(today)
            setNotes('')
        } else {
            const { record } = target
            setClientId(record.client_id)
            setMonth(record.month)
            setAmount(String(Number(record.amount)).replace('.', ','))
            setStatus(target.status ?? record.status)
            setMethod(record.payment_method || NO_METHOD)
            setPaidDate(record.paid_at ? record.paid_at.slice(0, 10) : today)
            setNotes(record.notes ?? '')
        }
    }, [target, clients, today])

    const isCreate = target?.mode === 'create'
    const year = target ? (target.mode === 'create' ? target.year : target.record.year) : 0
    const sortedClients = [...clients].sort((a, b) =>
        Number(b.status === 'active') - Number(a.status === 'active') || (a.full_name || '').localeCompare(b.full_name || '', 'es'))
    const methodOptions = method !== NO_METHOD && !PAYMENT_METHODS.includes(method as typeof PAYMENT_METHODS[number])
        ? [...PAYMENT_METHODS, method]
        : PAYMENT_METHODS

    const pickClient = (id: string) => {
        setClientId(id)
        const client = clients.find(c => c.id === id)
        if (client && feeOf(client) > 0) setAmount(String(feeOf(client)).replace('.', ','))
    }

    const save = async () => {
        if (!target) return
        const value = parseAmount(amount)
        if (!Number.isFinite(value) || value <= 0) {
            toast({ title: 'Indica un importe mayor que 0', variant: 'destructive' })
            return
        }
        if (isCreate && !clientId) {
            toast({ title: 'Elige un atleta', variant: 'destructive' })
            return
        }
        const paymentMethod = method === NO_METHOD ? null : method
        const paidAt = status === 'paid' ? `${paidDate || today}T12:00:00.000Z` : null

        setSaving(true)
        const result = target.mode === 'create'
            ? await createPaymentRecordAction({ clientId, year, month, amount: value, status, paymentMethod, paidAt, notes })
            : await updatePaymentRecordAction(target.record.id, {
                status,
                amount: value,
                notes,
                paymentMethod: status === 'paid' ? paymentMethod : null,
                paidAt,
            })
        setSaving(false)

        if (!result.success) {
            toast({ title: 'No se pudo guardar', description: result.error, variant: 'destructive' })
            return
        }
        toast({ title: isCreate ? 'Cobro registrado' : 'Cobro actualizado' })
        onSaved()
        onOpenChange(false)
    }

    const title = !target
        ? ''
        : target.mode === 'create'
            ? 'Registrar cobro'
            : `Cobro de ${target.clientName}`

    return (
        <Dialog open={!!target} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{MONTH_LONG[month - 1]} {year}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {isCreate && (
                        <div className="grid grid-cols-[1fr_auto] gap-3">
                            <div className="min-w-0 space-y-1.5">
                                <Label>Atleta</Label>
                                <Select value={clientId} onValueChange={pickClient}>
                                    <SelectTrigger><SelectValue placeholder="Elige un atleta" /></SelectTrigger>
                                    <SelectContent>
                                        {sortedClients.map(client => (
                                            <SelectItem key={client.id} value={client.id}>
                                                {client.full_name || client.email || 'Atleta'}{client.status !== 'active' ? ' · de baja' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Mes</Label>
                                <Select value={String(month)} onValueChange={value => setMonth(Number(value))}>
                                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {MONTH_LONG.map((label, index) => (
                                            <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label>Estado</Label>
                        <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
                            {([['paid', 'Cobrado'], ['pending', 'Pendiente'], ['waived', 'Exento']] as const).map(([value, label]) => {
                                const active = status === value || (value === 'pending' && status === 'overdue')
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setStatus(value)}
                                        className={`h-8 rounded-full text-xs font-semibold transition-all ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="record-amount">Importe ({currency === 'EUR' ? '€' : currency})</Label>
                            <Input id="record-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
                        </div>
                        {status === 'paid' && (
                            <div className="space-y-1.5">
                                <Label htmlFor="record-date">Fecha de cobro</Label>
                                <Input id="record-date" type="date" value={paidDate} max={today} onChange={e => setPaidDate(e.target.value)} />
                            </div>
                        )}
                    </div>

                    {status === 'paid' && (
                        <div className="space-y-1.5">
                            <Label>Método</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {[NO_METHOD, ...methodOptions].map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setMethod(option)}
                                        className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${method === option ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {option === NO_METHOD ? 'Sin indicar' : option}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="record-notes">Nota</Label>
                        <Textarea id="record-notes" rows={2} placeholder="Opcional" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isCreate ? 'Registrar' : 'Guardar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
