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
    Flame,
    Beef,
    Wheat,
    Droplet,
    Footprints,
    Plus,
    Pencil,
    AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useActiveMacroPlan, useUpsertMacroPlan } from '@/hooks/useMacroPlan'
import type { MacroPlan } from '@/data/nutrition/types'

interface MacroPlanPanelProps {
    coachId: string
    clientId: string
}

interface FormData {
    kcal: number
    protein: number
    carbs: number
    fat: number
    steps_goal: number | undefined
    notes: string
    effective_from: string
    effective_to: string
}

export function MacroPlanPanel({ coachId, clientId }: MacroPlanPanelProps) {
    const { data: activePlan, isLoading, error, refetch } = useActiveMacroPlan(coachId, clientId)
    const upsertMutation = useUpsertMacroPlan(coachId, clientId)

    const [showForm, setShowForm] = useState(false)
    const [editingPlan, setEditingPlan] = useState<MacroPlan | null>(null)
    const [formData, setFormData] = useState<FormData>({
        kcal: 2000,
        protein: 150,
        carbs: 200,
        fat: 70,
        steps_goal: undefined,
        notes: '',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
    })

    const handleCreate = () => {
        setEditingPlan(null)
        setFormData({
            kcal: 2000,
            protein: 150,
            carbs: 200,
            fat: 70,
            steps_goal: undefined,
            notes: '',
            effective_from: new Date().toISOString().split('T')[0],
            effective_to: '',
        })
        setShowForm(true)
    }

    const handleEdit = () => {
        if (!activePlan) return
        setEditingPlan(activePlan)
        setFormData({
            kcal: activePlan.kcal,
            protein: activePlan.protein_g,
            carbs: activePlan.carbs_g,
            fat: activePlan.fat_g,
            steps_goal: activePlan.steps_goal,
            notes: activePlan.notes || '',
            effective_from: activePlan.effective_from,
            effective_to: activePlan.effective_to || '',
        })
        setShowForm(true)
    }

    const handleSave = async () => {
        await upsertMutation.mutateAsync({
            id: editingPlan?.id,
            kcal: formData.kcal,
            protein_g: formData.protein,
            carbs_g: formData.carbs,
            fat_g: formData.fat,
            steps_goal: formData.steps_goal || undefined,
            notes: formData.notes || undefined,
            effective_from: formData.effective_from,
            effective_to: formData.effective_to || null,
        })
        setShowForm(false)
        setEditingPlan(null)
    }

    if (isLoading) {
        return (
            <Card className="p-6 space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                </div>
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="p-6">
                <div className="text-center text-destructive">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>Error al cargar los macros</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                        Reintentar
                    </Button>
                </div>
            </Card>
        )
    }

    return (
        <>
            <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">Macros activos</h3>
                    <div className="flex gap-2">
                        {activePlan && (
                            <Button variant="outline" size="sm" onClick={handleEdit}>
                                <Pencil className="h-4 w-4 mr-1" />
                                Editar
                            </Button>
                        )}
                        <Button size="sm" onClick={handleCreate}>
                            <Plus className="h-4 w-4 mr-1" />
                            {activePlan ? 'Nuevo' : 'Crear'}
                        </Button>
                    </div>
                </div>

                {activePlan ? (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <Badge variant="secondary" className="bg-success/10 text-success border-0">
                                Activo desde: {format(new Date(activePlan.effective_from), 'dd MMM yyyy', { locale: es })}
                            </Badge>
                            {activePlan.effective_to && (
                                <Badge variant="outline">
                                    Hasta: {format(new Date(activePlan.effective_to), 'dd MMM yyyy', { locale: es })}
                                </Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <MacroCard icon={Flame} value={activePlan.kcal} unit="kcal" color="text-accent" />
                            <MacroCard icon={Beef} value={activePlan.protein_g} unit="g proteína" color="text-destructive" />
                            <MacroCard icon={Wheat} value={activePlan.carbs_g} unit="g carbos" color="text-warning" />
                            <MacroCard icon={Droplet} value={activePlan.fat_g} unit="g grasa" color="text-warning/80" />
                        </div>

                        {activePlan.steps_goal && (
                            <div className="mt-3">
                                <Card className="flex items-center gap-3 p-4 bg-muted/30">
                                    <Footprints className="h-5 w-5 text-primary" />
                                    <span className="font-semibold">{activePlan.steps_goal.toLocaleString()}</span>
                                    <span className="text-sm text-muted-foreground">pasos/día</span>
                                </Card>
                            </div>
                        )}

                        {activePlan.notes && (
                            <p className="mt-3 text-sm text-muted-foreground">{activePlan.notes}</p>
                        )}
                    </>
                ) : (
                    <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                        <p className="text-muted-foreground">Sin plan de macros activo</p>
                        <Button variant="outline" className="mt-4" onClick={handleCreate}>
                            <Plus className="h-4 w-4 mr-1" />
                            Crear plan de macros
                        </Button>
                    </div>
                )}
            </Card>

            {/* Form Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingPlan ? 'Editar plan de macros' : 'Nuevo plan de macros'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Calorías (kcal)</Label>
                                <Input
                                    type="number"
                                    value={formData.kcal}
                                    onChange={(e) => setFormData({ ...formData, kcal: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Proteína (g)</Label>
                                <Input
                                    type="number"
                                    value={formData.protein}
                                    onChange={(e) => setFormData({ ...formData, protein: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Carbohidratos (g)</Label>
                                <Input
                                    type="number"
                                    value={formData.carbs}
                                    onChange={(e) => setFormData({ ...formData, carbs: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Grasas (g)</Label>
                                <Input
                                    type="number"
                                    value={formData.fat}
                                    onChange={(e) => setFormData({ ...formData, fat: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Objetivo de pasos (opcional)</Label>
                            <Input
                                type="number"
                                placeholder="ej: 10000"
                                value={formData.steps_goal || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    steps_goal: e.target.value ? Number(e.target.value) : undefined
                                })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Desde</Label>
                                <Input
                                    type="date"
                                    value={formData.effective_from}
                                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Hasta (opcional)</Label>
                                <Input
                                    type="date"
                                    value={formData.effective_to}
                                    onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Notas (opcional)</Label>
                            <Input
                                placeholder="Notas adicionales..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowForm(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                            {upsertMutation.isPending ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

function MacroCard({
    icon: Icon,
    value,
    unit,
    color,
}: {
    icon: React.ComponentType<{ className?: string }>
    value: number
    unit: string
    color: string
}) {
    return (
        <Card className="p-4 flex flex-col items-center text-center">
            <Icon className={`h-6 w-6 ${color} mb-2`} />
            <span className="text-2xl font-bold">{value}</span>
            <span className="text-xs text-muted-foreground">{unit}</span>
        </Card>
    )
}
