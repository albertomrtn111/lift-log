'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
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
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs'
import {
    Flame,
    Footprints,
    Plus,
    Pencil,
    AlertCircle,
    Dumbbell,
    Moon,
    ArrowLeft,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useActiveMacroPlan, useUpsertMacroPlan } from '@/hooks/useMacroPlan'
import type { MacroPlan, MacroDayTypeConfig, MacroDayTypeValues } from '@/data/nutrition/types'
import { cn } from '@/lib/utils'
import { AINutritionDialog } from './AINutritionDialog'

// ============================================================================
// TYPES
// ============================================================================

interface MacroPlanPanelProps {
    coachId: string
    clientId: string
}

type MacroMode = 'simple' | 'day_type'
type ModalStep = 'mode' | 'form'

interface MacroValues {
    kcal: number
    protein: number
    carbs: number
    fat: number
}

interface FormData {
    // Simple mode values
    simple: MacroValues
    // Day-type mode values
    training: MacroValues
    rest: MacroValues
    // Common fields
    steps: number | undefined
    notes: string
    effective_from: string
    effective_to: string
}

const DEFAULT_VALUES: MacroValues = { kcal: 2000, protein: 150, carbs: 200, fat: 70 }

// ============================================================================
// HELPERS
// ============================================================================

function isPerDayType(plan: MacroPlan): boolean {
    return !!plan.day_type_config
}

function planToFormData(plan: MacroPlan): { mode: MacroMode; formData: FormData } {
    if (plan.day_type_config) {
        const cfg = plan.day_type_config
        return {
            mode: 'day_type',
            formData: {
                simple: DEFAULT_VALUES,
                training: {
                    kcal: cfg.training.kcal,
                    protein: cfg.training.protein_g,
                    carbs: cfg.training.carbs_g,
                    fat: cfg.training.fat_g,
                },
                rest: {
                    kcal: cfg.rest.kcal,
                    protein: cfg.rest.protein_g,
                    carbs: cfg.rest.carbs_g,
                    fat: cfg.rest.fat_g,
                },
                steps: plan.steps ?? undefined,
                notes: plan.notes || '',
                effective_from: plan.effective_from,
                effective_to: plan.effective_to || '',
            },
        }
    }

    return {
        mode: 'simple',
        formData: {
            simple: {
                kcal: plan.kcal,
                protein: plan.protein_g,
                carbs: plan.carbs_g,
                fat: plan.fat_g,
            },
            training: DEFAULT_VALUES,
            rest: { ...DEFAULT_VALUES, kcal: 1800, carbs: 150 },
            steps: plan.steps ?? undefined,
            notes: plan.notes || '',
            effective_from: plan.effective_from,
            effective_to: plan.effective_to || '',
        },
    }
}

function freshFormData(): FormData {
    return {
        simple: { ...DEFAULT_VALUES },
        training: { ...DEFAULT_VALUES, kcal: 2500, carbs: 250 },
        rest: { ...DEFAULT_VALUES, kcal: 1800, carbs: 150 },
        steps: undefined,
        notes: '',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
    }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MacroPlanPanel({ coachId, clientId }: MacroPlanPanelProps) {
    const { data: activePlan, isLoading, error, refetch } = useActiveMacroPlan(coachId, clientId)
    const upsertMutation = useUpsertMacroPlan(coachId, clientId)

    const [showForm, setShowForm] = useState(false)
    const [editingPlan, setEditingPlan] = useState<MacroPlan | null>(null)
    const [macroMode, setMacroMode] = useState<MacroMode>('simple')
    const [modalStep, setModalStep] = useState<ModalStep>('mode')
    const [formData, setFormData] = useState<FormData>(freshFormData())

    // ---- handlers -------------------------------------------------------

    const handleCreate = () => {
        setEditingPlan(null)
        setMacroMode('simple')
        setModalStep('mode')
        setFormData(freshFormData())
        setShowForm(true)
    }

    const handleEdit = () => {
        if (!activePlan) return
        const { mode, formData: fd } = planToFormData(activePlan)
        setEditingPlan(activePlan)
        setMacroMode(mode)
        setModalStep('form') // skip mode selection when editing
        setFormData(fd)
        setShowForm(true)
    }

    const handleSelectMode = (mode: MacroMode) => {
        setMacroMode(mode)
        setModalStep('form')
    }

    const handleSave = async () => {
        let dayTypeConfig: MacroDayTypeConfig | null = null
        let kcal = 0
        let protein_g = 0
        let carbs_g = 0
        let fat_g = 0

        if (macroMode === 'simple') {
            kcal = formData.simple.kcal
            protein_g = formData.simple.protein
            carbs_g = formData.simple.carbs
            fat_g = formData.simple.fat
        } else {
            dayTypeConfig = {
                training: {
                    kcal: formData.training.kcal,
                    protein_g: formData.training.protein,
                    carbs_g: formData.training.carbs,
                    fat_g: formData.training.fat,
                },
                rest: {
                    kcal: formData.rest.kcal,
                    protein_g: formData.rest.protein,
                    carbs_g: formData.rest.carbs,
                    fat_g: formData.rest.fat,
                },
            }
        }

        try {
            await upsertMutation.mutateAsync({
                id: editingPlan?.id,
                kcal,
                protein_g,
                carbs_g,
                fat_g,
                day_type_config: dayTypeConfig,
                steps: formData.steps || undefined,
                notes: formData.notes || undefined,
                effective_from: formData.effective_from,
                effective_to: formData.effective_to || null,
            })
            setShowForm(false)
            setEditingPlan(null)
        } catch (error) {
            // onError from useMutation already handles the error toast
            // The modal remains open so the user can retry or adjust values
            console.error('[handleSave] Error saving macro plan:', error)
        }
    }

    const updateValues = (key: 'simple' | 'training' | 'rest', field: keyof MacroValues, value: number) => {
        setFormData(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value },
        }))
    }

    // ---- loading / error ------------------------------------------------

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

    // ---- render ---------------------------------------------------------

    return (
        <>
            <Card className="rounded-2xl border-border/70 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Macros activos</h3>
                    <div className="flex flex-wrap gap-2">
                        <AINutritionDialog
                            coachId={coachId}
                            clientId={clientId}
                            nutritionType="macros"
                            trigger={
                                <AIActionButton size="sm" className="rounded-full">IA Macros</AIActionButton>
                            }
                        />
                        {activePlan && (
                            <Button variant="outline" size="sm" className="rounded-full" onClick={handleEdit}>
                                <Pencil className="h-4 w-4 mr-1" />
                                Editar
                            </Button>
                        )}
                        <Button size="sm" variant={activePlan ? 'outline' : 'default'} className="rounded-full" onClick={handleCreate}>
                            <Plus className="h-4 w-4 mr-1" />
                            {activePlan ? 'Nuevo' : 'Crear'}
                        </Button>
                    </div>
                </div>

                {activePlan ? (
                    <ActivePlanView plan={activePlan} />
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
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingPlan ? 'Editar plan de macros' : 'Nuevo plan de macros'}
                        </DialogTitle>
                    </DialogHeader>

                    {modalStep === 'mode' && (
                        <ModeSelectionStep onSelect={handleSelectMode} />
                    )}

                    {modalStep === 'form' && (
                        <MacroFormStep
                            mode={macroMode}
                            formData={formData}
                            isEditing={!!editingPlan}
                            isSaving={upsertMutation.isPending}
                            onUpdateValues={updateValues}
                            onFormDataChange={setFormData}
                            onBack={() => setModalStep('mode')}
                            onSave={handleSave}
                            onCancel={() => setShowForm(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}

// ============================================================================
// STEP 0: MODE SELECTION
// ============================================================================

function ModeSelectionStep({ onSelect }: { onSelect: (mode: MacroMode) => void }) {
    return (
        <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
                ¿Cómo quieres configurar este plan de macros?
            </p>

            <div className="grid gap-3">
                {/* Simple */}
                <button
                    type="button"
                    onClick={() => onSelect('simple')}
                    className={cn(
                        'text-left rounded-xl border-2 p-4 transition-all',
                        'hover:border-primary/60 hover:bg-primary/5',
                        'border-muted-foreground/20'
                    )}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Flame className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="font-medium">Una sola configuración</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Usa los mismos macros para todos los días.
                            </p>
                        </div>
                    </div>
                </button>

                {/* Day type */}
                <button
                    type="button"
                    onClick={() => onSelect('day_type')}
                    className={cn(
                        'text-left rounded-xl border-2 p-4 transition-all',
                        'hover:border-primary/60 hover:bg-primary/5',
                        'border-muted-foreground/20'
                    )}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                            <Dumbbell className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                            <p className="font-medium">Días de entreno y descanso</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Configura macros distintos según el tipo de día.
                            </p>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    )
}

// ============================================================================
// FORM STEP
// ============================================================================

interface MacroFormStepProps {
    mode: MacroMode
    formData: FormData
    isEditing: boolean
    isSaving: boolean
    onUpdateValues: (key: 'simple' | 'training' | 'rest', field: keyof MacroValues, value: number) => void
    onFormDataChange: (fd: FormData) => void
    onBack: () => void
    onSave: () => void
    onCancel: () => void
}

function MacroFormStep({
    mode,
    formData,
    isEditing,
    isSaving,
    onUpdateValues,
    onFormDataChange,
    onBack,
    onSave,
    onCancel,
}: MacroFormStepProps) {
    return (
        <div className="space-y-4 py-2">
            {/* Mode indicator */}
            <div className="flex items-center gap-2">
                {!isEditing && (
                    <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
                        <ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                )}
                <Badge variant="secondary" className="text-xs">
                    {mode === 'simple' ? 'Configuración única' : 'Entreno / Descanso'}
                </Badge>
            </div>

            {/* Macro fields */}
            {mode === 'simple' ? (
                <MacroFieldsBlock
                    values={formData.simple}
                    onChange={(field, val) => onUpdateValues('simple', field, val)}
                />
            ) : (
                <Tabs defaultValue="training" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="training" className="gap-1.5">
                            <Dumbbell className="h-3.5 w-3.5" />
                            Días de entreno
                        </TabsTrigger>
                        <TabsTrigger value="rest" className="gap-1.5">
                            <Moon className="h-3.5 w-3.5" />
                            Días de descanso
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="training" className="mt-3">
                        <MacroFieldsBlock
                            values={formData.training}
                            onChange={(field, val) => onUpdateValues('training', field, val)}
                        />
                    </TabsContent>
                    <TabsContent value="rest" className="mt-3">
                        <MacroFieldsBlock
                            values={formData.rest}
                            onChange={(field, val) => onUpdateValues('rest', field, val)}
                        />
                    </TabsContent>
                </Tabs>
            )}

            {/* Common fields */}
            <div className="space-y-2">
                <Label>Objetivo de pasos (opcional)</Label>
                <Input
                    type="number"
                    placeholder="ej: 10000"
                    value={formData.steps || ''}
                    onChange={(e) => onFormDataChange({
                        ...formData,
                        steps: e.target.value ? Number(e.target.value) : undefined
                    })}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Desde</Label>
                    <Input
                        type="date"
                        value={formData.effective_from}
                        onChange={(e) => onFormDataChange({ ...formData, effective_from: e.target.value })}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Hasta (opcional)</Label>
                    <Input
                        type="date"
                        value={formData.effective_to}
                        onChange={(e) => onFormDataChange({ ...formData, effective_to: e.target.value })}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Input
                    placeholder="Notas adicionales..."
                    value={formData.notes}
                    onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
                />
            </div>

            {/* Footer */}
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button onClick={onSave} disabled={isSaving}>
                    {isSaving ? 'Guardando...' : 'Guardar'}
                </Button>
            </DialogFooter>
        </div>
    )
}

// ============================================================================
// MACRO FIELDS BLOCK (reused for simple, training, and rest)
// ============================================================================

function MacroFieldsBlock({
    values,
    onChange,
}: {
    values: MacroValues
    onChange: (field: keyof MacroValues, value: number) => void
}) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>Calorías (kcal)</Label>
                <Input
                    type="number"
                    value={values.kcal}
                    onChange={(e) => onChange('kcal', Number(e.target.value))}
                />
            </div>
            <div className="space-y-2">
                <Label>Proteína (g)</Label>
                <Input
                    type="number"
                    value={values.protein}
                    onChange={(e) => onChange('protein', Number(e.target.value))}
                />
            </div>
            <div className="space-y-2">
                <Label>Carbohidratos (g)</Label>
                <Input
                    type="number"
                    value={values.carbs}
                    onChange={(e) => onChange('carbs', Number(e.target.value))}
                />
            </div>
            <div className="space-y-2">
                <Label>Grasas (g)</Label>
                <Input
                    type="number"
                    value={values.fat}
                    onChange={(e) => onChange('fat', Number(e.target.value))}
                />
            </div>
        </div>
    )
}

// ============================================================================
// ACTIVE PLAN VIEW
// ============================================================================

function ActivePlanView({ plan }: { plan: MacroPlan }) {
    const perDay = isPerDayType(plan)
    const cfg = plan.day_type_config

    return (
        <>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                    Activo desde: {format(new Date(plan.effective_from), 'dd MMM yyyy', { locale: es })}
                </Badge>
                {plan.effective_to && (
                    <Badge variant="outline">
                        Hasta: {format(new Date(plan.effective_to), 'dd MMM yyyy', { locale: es })}
                    </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                    {perDay ? 'Entreno / Descanso' : 'Configuración única'}
                </Badge>
            </div>

            {perDay && cfg ? (
                <div className="space-y-4">
                    {/* Training */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Dumbbell className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium">Días de entreno</span>
                        </div>
                        <MacroSummary kcal={cfg.training.kcal} protein={cfg.training.protein_g} carbs={cfg.training.carbs_g} fat={cfg.training.fat_g} />
                    </div>

                    {/* Rest */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Moon className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium">Días de descanso</span>
                        </div>
                        <MacroSummary kcal={cfg.rest.kcal} protein={cfg.rest.protein_g} carbs={cfg.rest.carbs_g} fat={cfg.rest.fat_g} />
                    </div>
                </div>
            ) : (
                <MacroSummary kcal={plan.kcal} protein={plan.protein_g} carbs={plan.carbs_g} fat={plan.fat_g} />
            )}

            {plan.steps && (
                <div className="mt-3">
                    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
                        <Footprints className="h-5 w-5 text-primary" />
                        <span className="font-semibold tabular-nums">{plan.steps.toLocaleString('es-ES')}</span>
                        <span className="text-sm text-muted-foreground">pasos al día</span>
                    </div>
                </div>
            )}

            {plan.notes && (
                <p className="mt-3 text-sm text-muted-foreground">{plan.notes}</p>
            )}
        </>
    )
}

// ============================================================================
// MACRO SUMMARY
// ============================================================================

/** Kcal destacadas + reparto energético de cada macro (P y C a 4 kcal/g, G a 9) */
function MacroSummary({ kcal, protein, carbs, fat }: { kcal: number; protein: number; carbs: number; fat: number }) {
    const parts = [
        { key: 'protein', label: 'Proteína', grams: protein, kcal: protein * 4, bar: 'bg-rose-500', text: 'text-rose-500' },
        { key: 'carbs', label: 'Carbos', grams: carbs, kcal: carbs * 4, bar: 'bg-amber-500', text: 'text-amber-500' },
        { key: 'fat', label: 'Grasa', grams: fat, kcal: fat * 9, bar: 'bg-sky-500', text: 'text-sky-500' },
    ]
    const macroKcal = parts.reduce((sum, part) => sum + part.kcal, 0) || 1

    return (
        <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
                <p className="flex items-baseline gap-1.5">
                    <Flame className="h-4 w-4 self-center text-orange-500" />
                    <span className="text-3xl font-bold tabular-nums tracking-tight">{kcal.toLocaleString('es-ES')}</span>
                    <span className="text-sm text-muted-foreground">kcal</span>
                </p>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                {parts.map(part => (
                    <span key={part.key} className={part.bar} style={{ width: `${(part.kcal / macroKcal) * 100}%` }} />
                ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                {parts.map(part => (
                    <div key={part.key} className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${part.bar}`} />
                            {part.label}
                        </p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight">
                            {part.grams}<span className="ml-0.5 text-xs font-medium text-muted-foreground">g</span>
                        </p>
                        <p className={`text-[11px] font-semibold tabular-nums ${part.text}`}>{Math.round((part.kcal / macroKcal) * 100)}%</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
