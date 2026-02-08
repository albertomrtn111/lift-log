'use client'

import { useState, useTransition } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Apple,
    Calculator,
    Utensils,
    Plus,
    Trash2,
    Loader2,
    ChevronLeft,
    X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { saveMacroPlanAction } from './actions'
import { createDietOptionsPlanFromModal } from '@/data/nutrition/dietOptions'
import type { DietPlanMealItem, DietPlanMealOption, DietPlanMeals } from '@/data/workspace'

interface DietPlanModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    onSuccess: () => void
}

type PlanType = 'macros' | 'options' | null
type Step = 'type' | 'macros' | 'meals-config' | 'meals-options'

const DEFAULT_MEALS = ['Desayuno', 'Almuerzo', 'Comida', 'Merienda', 'Cena']

export function DietPlanModal({ open, onOpenChange, coachId, clientId, onSuccess }: DietPlanModalProps) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    // Flow state
    const [planType, setPlanType] = useState<PlanType>(null)
    const [step, setStep] = useState<Step>('type')

    // Macro plan state
    const [macroData, setMacroData] = useState({
        kcal: 2000,
        protein: 150,
        carbs: 200,
        fat: 70,
        steps_goal: 10000,
        notes: '',
        effective_from: new Date().toISOString().split('T')[0],
    })

    // Diet plan state
    const [dietName, setDietName] = useState('')
    const [mealLabels, setMealLabels] = useState<string[]>([...DEFAULT_MEALS])
    const [mealsData, setMealsData] = useState<Record<string, DietPlanMealOption[]>>({})
    const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0])

    const resetState = () => {
        setPlanType(null)
        setStep('type')
        setMacroData({
            kcal: 2000, protein: 150, carbs: 200, fat: 70,
            steps_goal: 10000, notes: '',
            effective_from: new Date().toISOString().split('T')[0],
        })
        setDietName('')
        setMealLabels([...DEFAULT_MEALS])
        setMealsData({})
        setEffectiveFrom(new Date().toISOString().split('T')[0])
    }

    const handleClose = () => {
        resetState()
        onOpenChange(false)
    }

    const handleSelectType = (type: PlanType) => {
        setPlanType(type)
        if (type === 'macros') {
            setStep('macros')
        } else {
            setStep('meals-config')
        }
    }

    const handleSaveMacros = () => {
        startTransition(async () => {
            const result = await saveMacroPlanAction({
                coach_id: coachId,
                client_id: clientId,
                kcal: macroData.kcal,
                protein_g: macroData.protein,
                carbs_g: macroData.carbs,
                fat_g: macroData.fat,
                steps_goal: macroData.steps_goal,
                notes: macroData.notes,
                effective_from: macroData.effective_from,
            })
            if (!result.success) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }
            toast({ title: 'Plan guardado', description: 'Plan de macros creado correctamente.' })
            handleClose()
            onSuccess()
        })
    }

    const handleProceedToOptions = () => {
        // Initialize mealsData with empty options for each label
        const initialData: Record<string, DietPlanMealOption[]> = {}
        mealLabels.forEach(label => {
            initialData[label] = [{ title: 'Opción 1', items: [{ quantity: '', name: '', note: '' }], notes: '' }]
        })
        setMealsData(initialData)
        setStep('meals-options')
    }

    const handleSaveDietPlan = () => {
        if (!dietName.trim()) {
            toast({ title: 'Error', description: 'Introduce un nombre para el plan.', variant: 'destructive' })
            return
        }

        // Basic validation
        if (mealLabels.length === 0) {
            toast({ title: 'Error', description: 'Debes configurar al menos una comida.', variant: 'destructive' })
            return
        }

        startTransition(async () => {
            // Convert mealsData (DietPlanMealOption[]) to the format expected by createDietOptionsPlanFromModal
            const convertedMealsData: Record<string, Array<{
                title: string
                notes?: string
                items: Array<{ name: string; quantity?: string; note?: string }>
            }>> = {}

            for (const label of mealLabels) {
                const options = mealsData[label] || []
                convertedMealsData[label] = options.map(opt => ({
                    title: opt.title,
                    notes: opt.notes,
                    items: opt.items.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        note: item.note,
                    }))
                }))
            }

            console.log('[DietPlanModal] Calling createDietOptionsPlanFromModal with:', {
                coachId,
                clientId,
                dietName,
                effectiveFrom,
                mealLabels,
                convertedMealsData,
            })

            const result = await createDietOptionsPlanFromModal({
                coachId,
                clientId,
                dietName,
                effectiveFrom,
                mealLabels,
                mealsData: convertedMealsData,
            })

            if (!result.success) {
                console.error('[DietPlanModal] Error creating diet plan:', result.error, result.code)
                toast({
                    title: 'Error',
                    description: `${result.error}${result.code ? ` (${result.code})` : ''}`,
                    variant: 'destructive'
                })
                return
            }

            const { verification } = result
            console.log('[DietPlanModal] Diet plan saved successfully:', {
                planId: result.planId,
                verification
            })

            toast({
                title: 'Plan guardado',
                description: `Dieta creada: ${verification.mealsCount} comidas, ${verification.optionsCount} opciones, ${verification.itemsCount} items.${verification.archivedPlans > 0 ? ` (${verification.archivedPlans} plan anterior archivado)` : ''}`,
            })
            handleClose()
            onSuccess()
        })
    }

    // Helper functions for meal options
    const addOption = (mealLabel: string) => {
        setMealsData(prev => ({
            ...prev,
            [mealLabel]: [
                ...(prev[mealLabel] || []),
                { title: `Opción ${(prev[mealLabel]?.length || 0) + 1}`, items: [{ quantity: '', name: '' }], notes: '' }
            ]
        }))
    }

    const removeOption = (mealLabel: string, optionIndex: number) => {
        setMealsData(prev => ({
            ...prev,
            [mealLabel]: prev[mealLabel].filter((_, i) => i !== optionIndex)
        }))
    }

    const updateOption = (mealLabel: string, optionIndex: number, updates: Partial<DietPlanMealOption>) => {
        setMealsData(prev => ({
            ...prev,
            [mealLabel]: prev[mealLabel].map((opt, i) => i === optionIndex ? { ...opt, ...updates } : opt)
        }))
    }

    const addItem = (mealLabel: string, optionIndex: number) => {
        setMealsData(prev => ({
            ...prev,
            [mealLabel]: prev[mealLabel].map((opt, i) =>
                i === optionIndex
                    ? { ...opt, items: [...opt.items, { quantity: '', name: '' }] }
                    : opt
            )
        }))
    }

    const removeItem = (mealLabel: string, optionIndex: number, itemIndex: number) => {
        setMealsData(prev => ({
            ...prev,
            [mealLabel]: prev[mealLabel].map((opt, i) =>
                i === optionIndex
                    ? { ...opt, items: opt.items.filter((_, j) => j !== itemIndex) }
                    : opt
            )
        }))
    }

    const updateItem = (mealLabel: string, optionIndex: number, itemIndex: number, updates: Partial<DietPlanMealItem>) => {
        setMealsData(prev => ({
            ...prev,
            [mealLabel]: prev[mealLabel].map((opt, i) =>
                i === optionIndex
                    ? { ...opt, items: opt.items.map((item, j) => j === itemIndex ? { ...item, ...updates } : item) }
                    : opt
            )
        }))
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn(
                "max-h-[90vh] overflow-y-auto",
                step === 'meals-options' ? 'sm:max-w-[700px]' : 'sm:max-w-[500px]'
            )}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {step !== 'type' && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                if (step === 'macros' || step === 'meals-config') setStep('type')
                                else if (step === 'meals-options') setStep('meals-config')
                            }}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}
                        {step === 'type' && 'Crear nuevo plan'}
                        {step === 'macros' && 'Plan de macros'}
                        {step === 'meals-config' && 'Configurar comidas'}
                        {step === 'meals-options' && 'Añadir opciones'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'type' && 'Selecciona el tipo de plan que quieres crear'}
                        {step === 'macros' && 'Define los objetivos de macronutrientes'}
                        {step === 'meals-config' && 'Configura las comidas del día'}
                        {step === 'meals-options' && 'Añade opciones para cada comida'}
                    </DialogDescription>
                </DialogHeader>

                {/* STEP: Type Selection */}
                {step === 'type' && (
                    <div className="grid gap-4 py-4">
                        <Card
                            className="p-4 cursor-pointer hover:border-primary transition-colors"
                            onClick={() => handleSelectType('macros')}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Calculator className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h4 className="font-medium">Macros</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Define calorías, proteína, carbohidratos y grasa
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card
                            className="p-4 cursor-pointer hover:border-primary transition-colors"
                            onClick={() => handleSelectType('options')}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-accent/10">
                                    <Utensils className="h-5 w-5 text-accent" />
                                </div>
                                <div>
                                    <h4 className="font-medium">Dieta por opciones</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Configura comidas con múltiples opciones
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* STEP: Macros Form */}
                {step === 'macros' && (
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="kcal">Calorías</Label>
                                <Input
                                    id="kcal"
                                    type="number"
                                    value={macroData.kcal}
                                    onChange={e => setMacroData({ ...macroData, kcal: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="protein">Proteína (g)</Label>
                                <Input
                                    id="protein"
                                    type="number"
                                    value={macroData.protein}
                                    onChange={e => setMacroData({ ...macroData, protein: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="carbs">Carbohidratos (g)</Label>
                                <Input
                                    id="carbs"
                                    type="number"
                                    value={macroData.carbs}
                                    onChange={e => setMacroData({ ...macroData, carbs: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="fat">Grasas (g)</Label>
                                <Input
                                    id="fat"
                                    type="number"
                                    value={macroData.fat}
                                    onChange={e => setMacroData({ ...macroData, fat: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="steps">Pasos/día</Label>
                            <Input
                                id="steps"
                                type="number"
                                value={macroData.steps_goal}
                                onChange={e => setMacroData({ ...macroData, steps_goal: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="effective">Fecha inicio</Label>
                            <Input
                                id="effective"
                                type="date"
                                value={macroData.effective_from}
                                onChange={e => setMacroData({ ...macroData, effective_from: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="notes">Notas</Label>
                            <Textarea
                                id="notes"
                                value={macroData.notes}
                                onChange={e => setMacroData({ ...macroData, notes: e.target.value })}
                                rows={2}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                            <Button onClick={handleSaveMacros} disabled={isPending}>
                                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Guardar
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* STEP: Meals Config */}
                {step === 'meals-config' && (
                    <div className="space-y-4 py-4">
                        <div>
                            <Label htmlFor="diet-name">Nombre del plan</Label>
                            <Input
                                id="diet-name"
                                value={dietName}
                                onChange={e => setDietName(e.target.value)}
                                placeholder="Ej: Dieta volumen mayo"
                            />
                        </div>
                        <div>
                            <Label htmlFor="diet-date">Fecha inicio</Label>
                            <Input
                                id="diet-date"
                                type="date"
                                value={effectiveFrom}
                                onChange={e => setEffectiveFrom(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Comidas del día</Label>
                            <p className="text-sm text-muted-foreground mb-2">
                                Añade, elimina o reordena las comidas
                            </p>
                            <div className="space-y-2">
                                {mealLabels.map((label, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input
                                            value={label}
                                            onChange={e => {
                                                const newLabels = [...mealLabels]
                                                newLabels[index] = e.target.value
                                                setMealLabels(newLabels)
                                            }}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setMealLabels(mealLabels.filter((_, i) => i !== index))}
                                            disabled={mealLabels.length <= 1}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMealLabels([...mealLabels, `Comida ${mealLabels.length + 1}`])}
                                >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Añadir comida
                                </Button>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                            <Button onClick={handleProceedToOptions} disabled={!dietName.trim() || mealLabels.length === 0}>
                                Siguiente
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* STEP: Meals Options */}
                {step === 'meals-options' && (
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        {mealLabels.map(mealLabel => (
                            <Card key={mealLabel} className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold flex items-center gap-2">
                                        <Utensils className="h-4 w-4 text-primary" />
                                        {mealLabel}
                                    </h4>
                                    <Button variant="outline" size="sm" onClick={() => addOption(mealLabel)}>
                                        <Plus className="h-3 w-3 mr-1" />
                                        Opción
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    {(mealsData[mealLabel] || []).map((option, optionIndex) => (
                                        <div key={optionIndex} className="p-3 bg-muted/50 rounded-lg space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Input
                                                    value={option.title}
                                                    onChange={e => updateOption(mealLabel, optionIndex, { title: e.target.value })}
                                                    className="font-medium w-auto"
                                                    placeholder="Título opción"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-destructive"
                                                    onClick={() => removeOption(mealLabel, optionIndex)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>

                                            {/* Items */}
                                            <div className="space-y-2">
                                                {option.items.map((item, itemIndex) => (
                                                    <div key={itemIndex} className="flex gap-2">
                                                        <Input
                                                            value={item.quantity}
                                                            onChange={e => updateItem(mealLabel, optionIndex, itemIndex, { quantity: e.target.value })}
                                                            placeholder="Cantidad"
                                                            className="w-20"
                                                        />
                                                        <Input
                                                            value={item.name}
                                                            onChange={e => updateItem(mealLabel, optionIndex, itemIndex, { name: e.target.value })}
                                                            placeholder="Alimento"
                                                            className="flex-1"
                                                        />
                                                        <Input
                                                            value={item.note || ''}
                                                            onChange={e => updateItem(mealLabel, optionIndex, itemIndex, { note: e.target.value })}
                                                            placeholder="Nota"
                                                            className="w-24"
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-9 w-9"
                                                            onClick={() => removeItem(mealLabel, optionIndex, itemIndex)}
                                                            disabled={option.items.length <= 1}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => addItem(mealLabel, optionIndex)}
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Alimento
                                                </Button>
                                            </div>

                                            {/* Notes */}
                                            <Textarea
                                                value={option.notes || ''}
                                                onChange={e => updateOption(mealLabel, optionIndex, { notes: e.target.value })}
                                                placeholder="Notas para esta opción..."
                                                rows={2}
                                                className="text-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))}

                        <DialogFooter className="sticky bottom-0 bg-background pt-4">
                            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                            <Button onClick={handleSaveDietPlan} disabled={isPending}>
                                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Guardar plan
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
