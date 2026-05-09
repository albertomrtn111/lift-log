'use client'

import { useState, useTransition, useEffect } from 'react'
import { Client } from '@/types/coach'
import { FormTemplate } from '@/types/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Loader2, User, ClipboardCheck, CreditCard, Plug } from 'lucide-react'
import { updateClientAction } from './actions'
import { SchedulesTab } from './edit-client/SchedulesTab'
import type { ReviewTemplate } from '@/data/review-templates'

interface EditClientModalProps {
    client: Client
    formTemplates: FormTemplate[]
    reviewTemplates?: ReviewTemplate[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

const NONE_TEMPLATE_VALUE = '__none__'

function getActiveTemplatesByType(formTemplates: FormTemplate[], type: 'onboarding') {
    return formTemplates
        .filter((template) => template.type === type && template.is_active)
        .sort((a, b) => a.title.localeCompare(b.title))
}

function getOnboardingTemplateForClient(formTemplates: FormTemplate[], clientId: string) {
    return formTemplates.find((t) =>
        t.type === 'onboarding' && (t.assigned_client_ids ?? []).includes(clientId)
    )?.id
}

function resolveOnboardingPayload(
    selectedValue: string,
    initialResolvedValue: string,
    initialWasExplicit: boolean
): string | null {
    if (selectedValue === NONE_TEMPLATE_VALUE) return null
    if (!initialWasExplicit && selectedValue === initialResolvedValue) return null
    return selectedValue
}

type TabKey = 'datos' | 'revisiones' | 'pago' | 'conectores'

export function EditClientModal({
    client,
    formTemplates,
    reviewTemplates = [],
    open,
    onOpenChange,
    onSuccess,
}: EditClientModalProps) {
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState<TabKey>('datos')
    const [error, setError] = useState<string | null>(null)

    const activeOnboardingTemplates = getActiveTemplatesByType(formTemplates, 'onboarding')
    const initialOnboardingId = getOnboardingTemplateForClient(formTemplates, client.id)
    const initialOnboardingResolved = initialOnboardingId ?? NONE_TEMPLATE_VALUE
    const initialOnboardingWasExplicit = !!initialOnboardingId

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
        onboarding_template_id: initialOnboardingResolved,
    })

    useEffect(() => {
        const onbId = getOnboardingTemplateForClient(formTemplates, client.id) ?? NONE_TEMPLATE_VALUE
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
            onboarding_template_id: onbId,
        })
        setError(null)
        setActiveTab('datos')
    }, [client, formTemplates])

    const recalculateNextCheckin = (startDate: string, frequency: number) => {
        const start = new Date(startDate)
        const next = new Date(start)
        next.setDate(next.getDate() + frequency)
        return next.toISOString().split('T')[0]
    }

    const handleStartDateChange = (newStartDate: string) => {
        setFormData(fd => ({
            ...fd,
            start_date: newStartDate,
            next_checkin_date: recalculateNextCheckin(newStartDate, fd.checkin_frequency_days),
        }))
    }

    const handleFrequencyChange = (newFrequency: number) => {
        setFormData(fd => ({
            ...fd,
            checkin_frequency_days: newFrequency,
            next_checkin_date: recalculateNextCheckin(fd.start_date, newFrequency),
        }))
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
                onboarding_template_id: resolveOnboardingPayload(
                    formData.onboarding_template_id,
                    initialOnboardingResolved,
                    initialOnboardingWasExplicit,
                ),
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
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar atleta</DialogTitle>
                    <DialogDescription>
                        Datos personales, plan de revisiones, pago y conectores.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="mt-2">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="datos" className="gap-1.5">
                            <User className="h-3.5 w-3.5" /> Datos
                        </TabsTrigger>
                        <TabsTrigger value="revisiones" className="gap-1.5">
                            <ClipboardCheck className="h-3.5 w-3.5" /> Revisiones
                        </TabsTrigger>
                        <TabsTrigger value="pago" className="gap-1.5">
                            <CreditCard className="h-3.5 w-3.5" /> Pago
                        </TabsTrigger>
                        <TabsTrigger value="conectores" className="gap-1.5">
                            <Plug className="h-3.5 w-3.5" /> Conectores
                        </TabsTrigger>
                    </TabsList>

                    {/* Form que envuelve solo a las pestañas que mutan client (datos / pago) */}
                    <form onSubmit={handleSubmit}>
                        {/* Datos */}
                        <TabsContent value="datos" className="space-y-4 pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
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
                                <div className="space-y-1.5">
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
                            </div>
                            <div className="space-y-1.5">
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

                            <div className="border-t pt-4 space-y-3">
                                <div>
                                    <Label className="text-sm font-medium">Frecuencia legacy (fallback)</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Se usa solo si el atleta no tiene revisiones asignadas en la pestaña Revisiones.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit_start_date">Fecha de inicio</Label>
                                        <Input
                                            id="edit_start_date"
                                            type="date"
                                            value={formData.start_date}
                                            onChange={(e) => handleStartDateChange(e.target.value)}
                                            required
                                            disabled={isPending}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit_frequency">Frecuencia (días)</Label>
                                        <Input
                                            id="edit_frequency"
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={formData.checkin_frequency_days}
                                            onChange={(e) => handleFrequencyChange(parseInt(e.target.value) || 14)}
                                            required
                                            disabled={isPending}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit_next_checkin">Próxima revisión</Label>
                                        <Input
                                            id="edit_next_checkin"
                                            type="date"
                                            value={formData.next_checkin_date}
                                            onChange={(e) => setFormData({ ...formData, next_checkin_date: e.target.value })}
                                            required
                                            disabled={isPending}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-4 space-y-2">
                                <div>
                                    <Label className="text-sm font-medium">Onboarding asignado</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        El formulario que recibe el atleta cuando empieza.
                                    </p>
                                </div>
                                <Select
                                    value={formData.onboarding_template_id}
                                    onValueChange={(v) => setFormData({ ...formData, onboarding_template_id: v })}
                                    disabled={isPending}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona onboarding" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_TEMPLATE_VALUE}>Sin asignar</SelectItem>
                                        {activeOnboardingTemplates.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {error && activeTab === 'datos' && (
                                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                    {error}
                                </div>
                            )}
                        </TabsContent>

                        {/* Pago */}
                        <TabsContent value="pago" className="space-y-4 pt-4">
                            <div>
                                <h3 className="text-sm font-semibold">Información de pago</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Para tu control interno.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
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
                                <div className="space-y-1.5">
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
                            <div className="space-y-1.5">
                                <Label htmlFor="edit_payment_notes">Notas</Label>
                                <Textarea
                                    id="edit_payment_notes"
                                    value={formData.payment_notes}
                                    onChange={(e) => setFormData({ ...formData, payment_notes: e.target.value })}
                                    placeholder="Bizum, transferencia, efectivo…"
                                    disabled={isPending}
                                    className="min-h-[60px] resize-none"
                                />
                            </div>

                            <Card className="p-3 bg-muted/40 border-dashed">
                                <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    <p className="text-sm font-medium">Stripe</p>
                                    <Badge variant="outline" className="text-[10px]">Próximamente</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Cobro automático mensual y recibos digitales.
                                </p>
                            </Card>

                            {error && activeTab === 'pago' && (
                                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                    {error}
                                </div>
                            )}
                        </TabsContent>

                        <DialogFooter className={(activeTab !== 'datos' && activeTab !== 'pago') ? 'hidden' : ''}>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando…</>
                                ) : 'Guardar cambios'}
                            </Button>
                        </DialogFooter>
                    </form>

                    {/* Revisiones — gestiona sus propios datos por separado */}
                    <TabsContent value="revisiones" className="pt-4">
                        <SchedulesTab clientId={client.id} reviewTemplates={reviewTemplates} />
                    </TabsContent>

                    {/* Conectores — placeholder visual */}
                    <TabsContent value="conectores" className="space-y-3 pt-4">
                        <div>
                            <h3 className="text-sm font-semibold">Conectores externos</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Integraciones que el propio atleta gestiona desde su perfil.
                            </p>
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-orange-500" fill="currentColor">
                                            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.172" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Strava</p>
                                        <p className="text-xs text-muted-foreground">Sincroniza entrenamientos cardio del atleta.</p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[10px]">Gestionado por el atleta</Badge>
                            </div>
                        </Card>

                        <Card className="p-4 bg-muted/40 border-dashed">
                            <div className="flex items-center gap-2">
                                <Plug className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium">Más integraciones</p>
                                <Badge variant="outline" className="text-[10px]">Próximamente</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Garmin, Apple Health, Whoop…
                            </p>
                        </Card>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
