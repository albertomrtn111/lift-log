'use client'

import { useState, useTransition, useEffect } from 'react'
import { Client } from '@/types/coach'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { updateClientAction } from './actions'

interface EditClientModalProps {
    client: Client
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function EditClientModal({ client, open, onOpenChange, onSuccess }: EditClientModalProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        full_name: client.full_name,
        email: client.email,
        phone: client.phone || '',
        start_date: client.start_date,
        checkin_frequency_days: client.checkin_frequency_days,
        next_checkin_date: client.next_checkin_date,
    })

    // Reset form when client changes
    useEffect(() => {
        setFormData({
            full_name: client.full_name,
            email: client.email,
            phone: client.phone || '',
            start_date: client.start_date,
            checkin_frequency_days: client.checkin_frequency_days,
            next_checkin_date: client.next_checkin_date,
        })
        setError(null)
    }, [client])

    // Auto-recalculate next_checkin_date when start_date or frequency changes
    const recalculateNextCheckin = (startDate: string, frequency: number) => {
        const start = new Date(startDate)
        const next = new Date(start)
        next.setDate(next.getDate() + frequency)
        return next.toISOString().split('T')[0]
    }

    const handleStartDateChange = (newStartDate: string) => {
        const newNextCheckin = recalculateNextCheckin(newStartDate, formData.checkin_frequency_days)
        setFormData({
            ...formData,
            start_date: newStartDate,
            next_checkin_date: newNextCheckin
        })
    }

    const handleFrequencyChange = (newFrequency: number) => {
        const newNextCheckin = recalculateNextCheckin(formData.start_date, newFrequency)
        setFormData({
            ...formData,
            checkin_frequency_days: newFrequency,
            next_checkin_date: newNextCheckin
        })
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        startTransition(async () => {
            const result = await updateClientAction(client.id, {
                full_name: formData.full_name,
                email: formData.email,
                phone: formData.phone || undefined,
                start_date: formData.start_date,
                checkin_frequency_days: formData.checkin_frequency_days,
                next_checkin_date: formData.next_checkin_date,
            })

            if (result.success) {
                onOpenChange(false)
                onSuccess()
            } else {
                setError(result.error || 'Error al actualizar el cliente')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar cliente</DialogTitle>
                    <DialogDescription>
                        Modifica los datos del cliente. Los cambios se guardarán automáticamente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit_full_name">Nombre completo *</Label>
                        <Input
                            id="edit_full_name"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder="Juan Pérez"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit_email">Email *</Label>
                        <Input
                            id="edit_email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="juan@ejemplo.com"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit_phone">Teléfono</Label>
                        <Input
                            id="edit_phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+34 600 000 000"
                            disabled={isPending}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit_start_date">Fecha inicio</Label>
                            <Input
                                id="edit_start_date"
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => handleStartDateChange(e.target.value)}
                                required
                                disabled={isPending}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit_frequency">Frecuencia (días)</Label>
                            <Input
                                id="edit_frequency"
                                type="number"
                                min={7}
                                max={30}
                                value={formData.checkin_frequency_days}
                                onChange={(e) => handleFrequencyChange(parseInt(e.target.value) || 14)}
                                required
                                disabled={isPending}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit_next_checkin">Próximo check-in</Label>
                        <Input
                            id="edit_next_checkin"
                            type="date"
                            value={formData.next_checkin_date}
                            onChange={(e) => setFormData({ ...formData, next_checkin_date: e.target.value })}
                            required
                            disabled={isPending}
                        />
                        <p className="text-xs text-muted-foreground">
                            Se recalcula automáticamente al cambiar fecha inicio o frecuencia
                        </p>
                    </div>

                    {error && (
                        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                            {error}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                'Guardar cambios'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
