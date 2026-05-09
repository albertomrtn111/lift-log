'use client'

import { useEffect, useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { ReviewTemplate } from '@/data/review-templates'
import type { ClientReviewScheduleWithTemplate } from '@/data/review-schedules'
import { computeNextDueDate } from '@/lib/review-schedule-utils'
import { createScheduleAction, updateScheduleAction } from './schedule-actions'

interface AddScheduleDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    clientId: string
    reviewTemplates: ReviewTemplate[]
    existingSchedules: ClientReviewScheduleWithTemplate[]
    editingSchedule?: ClientReviewScheduleWithTemplate | null
    onSaved: () => void
}

export function AddScheduleDialog({
    open,
    onOpenChange,
    clientId,
    reviewTemplates,
    existingSchedules,
    editingSchedule,
    onSaved,
}: AddScheduleDialogProps) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const [reviewTemplateId, setReviewTemplateId] = useState<string>('')
    const [frequencyDays, setFrequencyDays] = useState<number>(14)
    const [nextDueDate, setNextDueDate] = useState<string>('')
    const [isActive, setIsActive] = useState(true)

    // Plantillas disponibles: activas + (en modo edición) la actual aunque esté inactiva
    const usedTemplateIds = new Set(
        existingSchedules
            .filter(s => !editingSchedule || s.id !== editingSchedule.id)
            .map(s => s.review_template_id)
    )
    const availableTemplates = reviewTemplates.filter(
        t => t.is_active && !usedTemplateIds.has(t.id)
    )

    useEffect(() => {
        if (!open) return
        if (editingSchedule) {
            setReviewTemplateId(editingSchedule.review_template_id)
            setFrequencyDays(editingSchedule.frequency_days)
            setNextDueDate(editingSchedule.next_due_date ?? '')
            setIsActive(editingSchedule.is_active)
        } else {
            setReviewTemplateId('')
            setFrequencyDays(14)
            setNextDueDate(computeNextDueDate(14))
            setIsActive(true)
        }
        setError(null)
    }, [open, editingSchedule])

    // Al cambiar la plantilla, autocompletar frecuencia con su default si es nuevo
    const handleTemplateChange = (id: string) => {
        setReviewTemplateId(id)
        if (!editingSchedule) {
            const tpl = reviewTemplates.find(t => t.id === id)
            if (tpl) {
                setFrequencyDays(tpl.default_frequency_days)
                setNextDueDate(computeNextDueDate(tpl.default_frequency_days))
            }
        }
    }

    const handleFrequencyChange = (val: number) => {
        setFrequencyDays(val)
        if (!editingSchedule) {
            setNextDueDate(computeNextDueDate(val))
        }
    }

    const handleSave = () => {
        setError(null)
        if (!reviewTemplateId) {
            setError('Selecciona una plantilla de revisión')
            return
        }
        if (frequencyDays < 1 || frequencyDays > 365) {
            setError('La frecuencia debe estar entre 1 y 365 días')
            return
        }

        const payload = {
            client_id: clientId,
            review_template_id: reviewTemplateId,
            frequency_days: frequencyDays,
            next_due_date: nextDueDate || null,
            is_active: isActive,
        }

        startTransition(async () => {
            const result = editingSchedule
                ? await updateScheduleAction(editingSchedule.id, {
                    frequency_days: frequencyDays,
                    next_due_date: nextDueDate || null,
                    is_active: isActive,
                })
                : await createScheduleAction(payload)

            if (result.success) {
                toast({ title: editingSchedule ? 'Revisión actualizada' : 'Revisión añadida' })
                onSaved()
                onOpenChange(false)
            } else {
                setError(result.error ?? 'Error inesperado')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {editingSchedule ? 'Editar revisión' : 'Añadir revisión'}
                    </DialogTitle>
                    <DialogDescription>
                        {editingSchedule
                            ? 'Cambia la frecuencia, próxima fecha o pausa esta revisión.'
                            : 'Asigna una plantilla de revisión a este atleta con una frecuencia.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Plantilla — solo en modo creación */}
                    {!editingSchedule && (
                        <div>
                            <Label htmlFor="sched-template" className="text-xs">Plantilla de revisión <span className="text-destructive">*</span></Label>
                            <Select value={reviewTemplateId} onValueChange={handleTemplateChange}>
                                <SelectTrigger id="sched-template" className="mt-1.5">
                                    <SelectValue placeholder="Selecciona una plantilla" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTemplates.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-muted-foreground">
                                            No hay más plantillas disponibles. Crea una en Formularios → Plantillas de revisión.
                                        </div>
                                    ) : (
                                        availableTemplates.map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* En modo edición, mostrar la plantilla como info no editable */}
                    {editingSchedule && (
                        <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">Plantilla</p>
                            <p className="text-sm font-medium">{editingSchedule.review_template?.name ?? '—'}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="sched-freq" className="text-xs">Frecuencia (días)</Label>
                            <Input
                                id="sched-freq"
                                type="number"
                                min={1}
                                max={365}
                                value={frequencyDays}
                                onChange={(e) => handleFrequencyChange(parseInt(e.target.value) || 14)}
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label htmlFor="sched-next" className="text-xs">Próxima fecha</Label>
                            <Input
                                id="sched-next"
                                type="date"
                                value={nextDueDate}
                                onChange={(e) => setNextDueDate(e.target.value)}
                                className="mt-1.5"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                            <p className="text-sm font-medium">Activa</p>
                            <p className="text-xs text-muted-foreground">Las revisiones inactivas no se envían ni cuentan en el calendario.</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isPending || (!editingSchedule && availableTemplates.length === 0)}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingSchedule ? 'Guardar cambios' : 'Añadir revisión'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
