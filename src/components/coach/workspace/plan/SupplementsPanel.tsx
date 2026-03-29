'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    FlaskConical,
    Plus,
    Pencil,
    Trash2,
    Clock,
} from 'lucide-react'
import { useSupplements, useCreateSupplement, useUpdateSupplement, useDeleteSupplement } from '@/hooks/useSupplements'
import type { ClientSupplement, SupplementInput } from '@/data/supplements'

// ============================================================================
// TYPES
// ============================================================================

interface SupplementsPanelProps {
    coachId: string
    clientId: string
}

const DOSE_UNITS = ['g', 'mg', 'ml', 'cápsulas', 'UI', 'otro'] as const

interface FormState {
    supplement_name: string
    dose_amount: string
    dose_unit: string
    custom_unit: string
    daily_doses: number
    dose_schedule: string[]
    notes: string
    start_date: string
    end_date: string
}

function freshForm(): FormState {
    return {
        supplement_name: '',
        dose_amount: '',
        dose_unit: 'g',
        custom_unit: '',
        daily_doses: 1,
        dose_schedule: [''],
        notes: '',
        start_date: '',
        end_date: '',
    }
}

function supplementToForm(s: ClientSupplement): FormState {
    const isCustom = !DOSE_UNITS.includes(s.dose_unit as any)
    return {
        supplement_name: s.supplement_name,
        dose_amount: String(s.dose_amount),
        dose_unit: isCustom ? 'otro' : s.dose_unit,
        custom_unit: isCustom ? s.dose_unit : '',
        daily_doses: s.daily_doses,
        dose_schedule: s.dose_schedule.length > 0 ? [...s.dose_schedule] : [''],
        notes: s.notes || '',
        start_date: s.start_date || '',
        end_date: s.end_date || '',
    }
}

function formToInput(form: FormState): SupplementInput {
    const unit = form.dose_unit === 'otro' ? form.custom_unit.trim() || 'otro' : form.dose_unit
    return {
        supplement_name: form.supplement_name.trim(),
        dose_amount: parseFloat(form.dose_amount) || 0,
        dose_unit: unit,
        daily_doses: form.daily_doses,
        dose_schedule: form.dose_schedule.map(s => s.trim()),
        notes: form.notes.trim() || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
    }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SupplementsPanel({ coachId, clientId }: SupplementsPanelProps) {
    const { data: supplements, isLoading, error, refetch } = useSupplements(coachId, clientId)
    const createMutation = useCreateSupplement(coachId, clientId)
    const updateMutation = useUpdateSupplement(coachId, clientId)
    const deleteMutation = useDeleteSupplement(coachId, clientId)

    const [showForm, setShowForm] = useState(false)
    const [editingSupplement, setEditingSupplement] = useState<ClientSupplement | null>(null)
    const [form, setForm] = useState<FormState>(freshForm())
    const [deleteId, setDeleteId] = useState<string | null>(null)

    // ---- handlers -------------------------------------------------------

    const handleCreate = () => {
        setEditingSupplement(null)
        setForm(freshForm())
        setShowForm(true)
    }

    const handleEdit = (s: ClientSupplement) => {
        setEditingSupplement(s)
        setForm(supplementToForm(s))
        setShowForm(true)
    }

    const handleSave = async () => {
        const input = formToInput(form)
        try {
            if (editingSupplement) {
                await updateMutation.mutateAsync({ id: editingSupplement.id, input })
            } else {
                await createMutation.mutateAsync(input)
            }
            setShowForm(false)
            setEditingSupplement(null)
        } catch {
            // Error handled by mutation onError
        }
    }

    const handleConfirmDelete = async () => {
        if (!deleteId) return
        try {
            await deleteMutation.mutateAsync(deleteId)
        } catch {
            // Error handled by mutation onError
        }
        setDeleteId(null)
    }

    const handleDailyDosesChange = (value: number) => {
        const clamped = Math.max(1, Math.min(8, value))
        setForm(prev => {
            const newSchedule = [...prev.dose_schedule]
            while (newSchedule.length < clamped) newSchedule.push('')
            while (newSchedule.length > clamped) newSchedule.pop()
            return { ...prev, daily_doses: clamped, dose_schedule: newSchedule }
        })
    }

    const handleScheduleChange = (index: number, value: string) => {
        setForm(prev => {
            const newSchedule = [...prev.dose_schedule]
            newSchedule[index] = value
            return { ...prev, dose_schedule: newSchedule }
        })
    }

    const isValid = form.supplement_name.trim() !== '' &&
        parseFloat(form.dose_amount) > 0 &&
        form.daily_doses >= 1

    const isSaving = createMutation.isPending || updateMutation.isPending

    // ---- loading --------------------------------------------------------

    if (isLoading) {
        return (
            <Card className="p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="p-6">
                <div className="text-center text-destructive">
                    <FlaskConical className="h-8 w-8 mx-auto mb-2" />
                    <p>Error al cargar suplementos</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                        Reintentar
                    </Button>
                </div>
            </Card>
        )
    }

    // ---- render ---------------------------------------------------------

    return (
        <>
            <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <FlaskConical className="h-5 w-5 text-primary" />
                        Suplementación activa
                    </h3>
                    <Button size="sm" onClick={handleCreate}>
                        <Plus className="h-4 w-4 mr-1" />
                        Añadir suplemento
                    </Button>
                </div>

                {supplements && supplements.length > 0 ? (
                    <div className="space-y-3">
                        {supplements.map(s => (
                            <div
                                key={s.id}
                                className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium">{s.supplement_name}</span>
                                        <Badge variant="secondary" className="text-xs">
                                            {s.dose_amount} {s.dose_unit} × {s.daily_doses}/día
                                        </Badge>
                                    </div>
                                    {s.dose_schedule && s.dose_schedule.filter(Boolean).length > 0 && (
                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                            {s.dose_schedule.filter(Boolean).map((time, i) => (
                                                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {time}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                    {s.notes && (
                                        <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleEdit(s)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={() => setDeleteId(s.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                        <p className="text-muted-foreground">Sin suplementos activos</p>
                        <Button variant="outline" className="mt-4" onClick={handleCreate}>
                            <Plus className="h-4 w-4 mr-1" />
                            Añadir suplemento
                        </Button>
                    </div>
                )}
            </Card>

            {/* Add / Edit Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingSupplement ? 'Editar suplemento' : 'Añadir suplemento'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Supplement Name */}
                        <div className="space-y-2">
                            <Label>Suplemento *</Label>
                            <Input
                                placeholder="Ej: Creatina monohidrato"
                                value={form.supplement_name}
                                onChange={(e) => setForm(prev => ({ ...prev, supplement_name: e.target.value }))}
                            />
                        </div>

                        {/* Dose Amount + Unit */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Cantidad por toma *</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    placeholder="5"
                                    value={form.dose_amount}
                                    onChange={(e) => setForm(prev => ({ ...prev, dose_amount: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Unidad</Label>
                                <Select
                                    value={form.dose_unit}
                                    onValueChange={(val) => setForm(prev => ({ ...prev, dose_unit: val }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DOSE_UNITS.map(u => (
                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Custom unit input */}
                        {form.dose_unit === 'otro' && (
                            <div className="space-y-2">
                                <Label>Unidad personalizada</Label>
                                <Input
                                    placeholder="Ej: gotas, cucharadas..."
                                    value={form.custom_unit}
                                    onChange={(e) => setForm(prev => ({ ...prev, custom_unit: e.target.value }))}
                                />
                            </div>
                        )}

                        {/* Daily Doses */}
                        <div className="space-y-2">
                            <Label>Nº de tomas al día</Label>
                            <Input
                                type="number"
                                min={1}
                                max={8}
                                value={form.daily_doses}
                                onChange={(e) => handleDailyDosesChange(parseInt(e.target.value) || 1)}
                            />
                        </div>

                        {/* Dose Schedule */}
                        <div className="space-y-2">
                            <Label>Horario de cada toma</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {form.dose_schedule.map((time, i) => (
                                    <div key={i} className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Toma {i + 1}</span>
                                        <Input
                                            type="time"
                                            value={time}
                                            onChange={(e) => handleScheduleChange(i, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label>Notas (opcional)</Label>
                            <Input
                                placeholder="Ej: Tomar con comida..."
                                value={form.notes}
                                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>

                        {/* Start / End dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Fecha inicio (opcional)</Label>
                                <Input
                                    type="date"
                                    value={form.start_date}
                                    onChange={(e) => setForm(prev => ({ ...prev, start_date: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Fecha fin (opcional)</Label>
                                <Input
                                    type="date"
                                    value={form.end_date}
                                    onChange={(e) => setForm(prev => ({ ...prev, end_date: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowForm(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={!isValid || isSaving}>
                            {isSaving ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar suplemento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            El suplemento se desactivará y dejará de aparecer en la lista activa.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
