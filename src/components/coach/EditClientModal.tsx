'use client'

import { useState, useTransition, useEffect } from 'react'
import { Client } from '@/types/coach'
import { FormTemplate } from '@/types/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
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
    formTemplates: FormTemplate[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

const NONE_TEMPLATE_VALUE = '__none__'

function getActiveTemplatesByType(formTemplates: FormTemplate[], type: 'checkin' | 'onboarding') {
    return formTemplates
        .filter((template) => template.type === type && template.is_active)
        .sort((a, b) => a.title.localeCompare(b.title))
}

function getExplicitTemplateIdForClient(
    formTemplates: FormTemplate[],
    clientId: string,
    type: 'checkin' | 'onboarding'
) {
    return formTemplates.find((template) =>
        template.type === type && (template.assigned_client_ids ?? []).includes(clientId)
    )?.id
}

function getTemplateSelectionState(
    formTemplates: FormTemplate[],
    clientId: string,
    type: 'checkin' | 'onboarding'
) {
    const explicitTemplateId = getExplicitTemplateIdForClient(formTemplates, clientId, type)
    const resolvedTemplateId = explicitTemplateId ?? NONE_TEMPLATE_VALUE

    return {
        resolvedTemplateId,
        explicitTemplateId,
        isExplicit: Boolean(explicitTemplateId),
    }
}

function resolveAssignmentPayload(params: {
    selectedValue: string
    initialResolvedValue: string
    initialWasExplicit: boolean
}) {
    const { selectedValue, initialResolvedValue, initialWasExplicit } = params

    if (selectedValue === NONE_TEMPLATE_VALUE) return null
    if (!initialWasExplicit && selectedValue === initialResolvedValue) return null
    return selectedValue
}

export function EditClientModal({ client, formTemplates, open, onOpenChange, onSuccess }: EditClientModalProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [initialAssignmentState, setInitialAssignmentState] = useState({
        checkinResolvedValue: NONE_TEMPLATE_VALUE,
        checkinWasExplicit: false,
        onboardingResolvedValue: NONE_TEMPLATE_VALUE,
        onboardingWasExplicit: false,
    })

    const activeCheckinTemplates = getActiveTemplatesByType(formTemplates, 'checkin')
    const activeOnboardingTemplates = getActiveTemplatesByType(formTemplates, 'onboarding')

    const checkinSelection = getTemplateSelectionState(formTemplates, client.id, 'checkin')
    const onboardingSelection = getTemplateSelectionState(formTemplates, client.id, 'onboarding')

    const [formData, setFormData] = useState({
        full_name: client.full_name,
        email: client.email,
        phone: client.phone || '',
        start_date: client.start_date,
        checkin_frequency_days: client.checkin_frequency_days,
        next_checkin_date: client.next_checkin_date,
        payment_amount: client.payment_amount != null ? String(client.payment_amount) : '',
        payment_day: client.payment_day != null ? String(client.payment_day) : '',
        payment_notes: client.payment_notes || '',
        checkin_template_id: checkinSelection.resolvedTemplateId,
        onboarding_template_id: onboardingSelection.resolvedTemplateId,
    })

    // Reset form when client changes
    useEffect(() => {
        const nextCheckinSelection = getTemplateSelectionState(formTemplates, client.id, 'checkin')
        const nextOnboardingSelection = getTemplateSelectionState(formTemplates, client.id, 'onboarding')

        setFormData({
            full_name: client.full_name,
            email: client.email,
            phone: client.phone || '',
            start_date: client.start_date,
            checkin_frequency_days: client.checkin_frequency_days,
            next_checkin_date: client.next_checkin_date,
            payment_amount: client.payment_amount != null ? String(client.payment_amount) : '',
            payment_day: client.payment_day != null ? String(client.payment_day) : '',
            payment_notes: client.payment_notes || '',
            checkin_template_id: nextCheckinSelection.resolvedTemplateId,
            onboarding_template_id: nextOnboardingSelection.resolvedTemplateId,
        })
        setInitialAssignmentState({
            checkinResolvedValue: nextCheckinSelection.resolvedTemplateId,
            checkinWasExplicit: nextCheckinSelection.isExplicit,
            onboardingResolvedValue: nextOnboardingSelection.resolvedTemplateId,
            onboardingWasExplicit: nextOnboardingSelection.isExplicit,
        })
        setError(null)
    }, [client, formTemplates])

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
                payment_amount: formData.payment_amount !== '' ? parseFloat(formData.payment_amount) : null,
                payment_day: formData.payment_day !== '' ? parseInt(formData.payment_day) : null,
                payment_notes: formData.payment_notes || undefined,
                checkin_template_id: resolveAssignmentPayload({
                    selectedValue: formData.checkin_template_id,
                    initialResolvedValue: initialAssignmentState.checkinResolvedValue,
                    initialWasExplicit: initialAssignmentState.checkinWasExplicit,
                }),
                onboarding_template_id: resolveAssignmentPayload({
                    selectedValue: formData.onboarding_template_id,
                    initialResolvedValue: initialAssignmentState.onboardingResolvedValue,
                    initialWasExplicit: initialAssignmentState.onboardingWasExplicit,
                }),
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
            <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
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
                        <Label htmlFor="edit_next_checkin">Próxima revisión</Label>
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

                    <div className="border-t pt-4 mt-2 space-y-3">
                        <div>
                            <Label className="text-sm font-medium">Formularios asignados</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Cambiarlo aquí actualiza también la asignación dentro de Formularios.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit_checkin_template">Revisión</Label>
                            <Select
                                value={formData.checkin_template_id}
                                onValueChange={(value) => setFormData({ ...formData, checkin_template_id: value })}
                                disabled={isPending}
                            >
                                <SelectTrigger id="edit_checkin_template">
                                    <SelectValue placeholder="Selecciona una revisión" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_TEMPLATE_VALUE}>Sin asignar</SelectItem>
                                    {activeCheckinTemplates.map((template) => (
                                        <SelectItem key={template.id} value={template.id}>
                                            {template.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit_onboarding_template">Onboarding</Label>
                            <Select
                                value={formData.onboarding_template_id}
                                onValueChange={(value) => setFormData({ ...formData, onboarding_template_id: value })}
                                disabled={isPending}
                            >
                                <SelectTrigger id="edit_onboarding_template">
                                    <SelectValue placeholder="Selecciona un onboarding" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_TEMPLATE_VALUE}>Sin asignar</SelectItem>
                                    {activeOnboardingTemplates.map((template) => (
                                        <SelectItem key={template.id} value={template.id}>
                                            {template.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="border-t pt-4 mt-2 space-y-3">
                        <div>
                            <Label className="text-sm font-medium">💳 Información de pago</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Opcional — para tu control interno</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit_payment_amount">Cuota mensual (€)</Label>
                                <Input
                                    id="edit_payment_amount"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={formData.payment_amount}
                                    onChange={(e) => setFormData({ ...formData, payment_amount: e.target.value })}
                                    placeholder="150.00"
                                    disabled={isPending}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit_payment_day">Día de cobro</Label>
                                <Input
                                    id="edit_payment_day"
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={formData.payment_day}
                                    onChange={(e) => setFormData({ ...formData, payment_day: e.target.value })}
                                    placeholder="1"
                                    disabled={isPending}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit_payment_notes">Notas de pago</Label>
                            <Input
                                id="edit_payment_notes"
                                value={formData.payment_notes}
                                onChange={(e) => setFormData({ ...formData, payment_notes: e.target.value })}
                                placeholder="Bizum, transferencia, efectivo..."
                                disabled={isPending}
                            />
                        </div>
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
