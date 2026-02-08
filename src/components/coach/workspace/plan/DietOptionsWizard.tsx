'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    ArrowLeft,
    ArrowRight,
    Plus,
    Trash2,
    ChevronUp,
    ChevronDown,
    GripVertical,
    Loader2,
} from 'lucide-react'
import {
    useCreateDietPlan,
    useUpdateDietPlan,
    useDietPlanStructure,
} from '@/hooks/useDietOptions'
import type {
    DayType,
    DietPlanStatus,
    DietMealInput,
    DietMealOptionInput,
    DietOptionItemInput,
    ItemType,
} from '@/data/nutrition/types'

interface DietOptionsWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    editingPlanId: string | null
}

const DEFAULT_MEALS = ['Desayuno', 'Almuerzo', 'Comida', 'Merienda', 'Cena']
const DAY_TYPES: { value: DayType; label: string }[] = [
    { value: 'default', label: 'Normal' },
    { value: 'training', label: 'Entreno' },
    { value: 'rest', label: 'Descanso' },
]

interface WizardState {
    // Step 1
    name: string
    effective_from: string
    effective_to: string
    status: DietPlanStatus
    dayTypes: DayType[]
    // Step 2 & 3
    meals: DietMealInput[]
}

export function DietOptionsWizard({
    open,
    onOpenChange,
    coachId,
    clientId,
    editingPlanId,
}: DietOptionsWizardProps) {
    const [step, setStep] = useState(1)
    const [state, setState] = useState<WizardState>(getInitialState())

    const createMutation = useCreateDietPlan(coachId, clientId)
    const updateMutation = useUpdateDietPlan(clientId)
    const { data: existingPlan, isLoading: loadingExisting } = useDietPlanStructure(editingPlanId)

    // Load existing plan data when editing
    useEffect(() => {
        if (editingPlanId && existingPlan) {
            setState({
                name: existingPlan.name,
                effective_from: existingPlan.effective_from,
                effective_to: existingPlan.effective_to || '',
                status: existingPlan.status,
                dayTypes: [...new Set(existingPlan.meals.map(m => m.day_type))],
                meals: existingPlan.meals.map(meal => ({
                    day_type: meal.day_type,
                    name: meal.name,
                    order_index: meal.order_index,
                    options: meal.options.map(opt => ({
                        name: opt.name,
                        order_index: opt.order_index,
                        notes: opt.notes,
                        items: opt.items.map(item => {
                            // DEFENSIVE: Normalize name
                            const safeName = safeItemName(item)

                            // DEV LOG for broken items
                            if (process.env.NODE_ENV === 'development' && !item.name && !(item as any).food_name) {
                                console.warn('[DietOptionsWizard] Broken item detected (no name):', item)
                            }

                            return {
                                item_type: item.item_type,
                                name: safeName, // Force string
                                quantity_value: item.quantity_value,
                                quantity_unit: item.quantity_unit,
                                notes: item.notes,
                                order_index: item.order_index,
                            }
                        }),
                    })),
                })),
            })
        }
    }, [editingPlanId, existingPlan])

    // Reset when opening for create
    useEffect(() => {
        if (open && !editingPlanId) {
            setState(getInitialState())
            setStep(1)
        }
    }, [open, editingPlanId])

    const handleClose = () => {
        onOpenChange(false)
        setStep(1)
        setState(getInitialState())
    }

    const handleNext = () => {
        if (step === 1) {
            // Initialize meals for selected day types if empty
            if (state.meals.length === 0) {
                const initialMeals: DietMealInput[] = []
                state.dayTypes.forEach(dt => {
                    DEFAULT_MEALS.forEach((name, idx) => {
                        initialMeals.push({
                            day_type: dt,
                            name,
                            order_index: idx,
                            options: [createEmptyOption(0)],
                        })
                    })
                })
                setState(s => ({ ...s, meals: initialMeals }))
            }
        }
        setStep(s => s + 1)
    }

    const handleBack = () => setStep(s => s - 1)

    const handleSave = async () => {
        const input = {
            name: state.name,
            type: 'options' as const,
            status: state.status,
            effective_from: state.effective_from,
            effective_to: state.effective_to || null,
            meals: state.meals,
        }

        if (editingPlanId) {
            await updateMutation.mutateAsync({ planId: editingPlanId, input })
        } else {
            await createMutation.mutateAsync(input)
        }
        handleClose()
    }

    const isSaving = createMutation.isPending || updateMutation.isPending

    if (loadingExisting && editingPlanId) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-center h-48">
                        <p className="text-muted-foreground">Cargando...</p>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {editingPlanId ? 'Editar' : 'Nueva'} dieta por opciones
                    </DialogTitle>
                    <StepIndicator current={step} />
                </DialogHeader>

                {step === 1 && (
                    <Step1PlanInfo state={state} setState={setState} />
                )}
                {step === 2 && (
                    <Step2Meals state={state} setState={setState} />
                )}
                {step === 3 && (
                    <Step3Options state={state} setState={setState} />
                )}

                <div className="flex justify-between pt-4 border-t">
                    {step > 1 ? (
                        <Button variant="outline" onClick={handleBack}>
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Atrás
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={handleClose}>
                            Cancelar
                        </Button>
                    )}

                    {step < 3 ? (
                        <Button onClick={handleNext} disabled={!canProceed(step, state)}>
                            Siguiente
                            <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                    ) : (
                        <Button onClick={handleSave} disabled={isSaving || !isValid(state)} className="gap-2">
                            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isSaving ? 'Guardando...' : 'Guardar'}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({ current }: { current: number }) {
    const steps = ['Información', 'Comidas', 'Opciones']
    return (
        <div className="flex justify-center gap-4 py-2">
            {steps.map((label, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${idx + 1 === current
                            ? 'bg-primary text-primary-foreground'
                            : idx + 1 < current
                                ? 'bg-success text-success-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                    >
                        {idx + 1}
                    </div>
                    <span className="text-sm hidden sm:inline">{label}</span>
                </div>
            ))}
        </div>
    )
}

// ============================================================================
// STEP 1: PLAN INFO
// ============================================================================

function Step1PlanInfo({
    state,
    setState,
}: {
    state: WizardState
    setState: React.Dispatch<React.SetStateAction<WizardState>>
}) {
    return (
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Nombre del plan</Label>
                <Input
                    value={state.name}
                    onChange={(e) => setState(s => ({ ...s, name: e.target.value }))}
                    placeholder="Ej: Dieta definición 2024"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Fecha inicio</Label>
                    <Input
                        type="date"
                        value={state.effective_from}
                        onChange={(e) => setState(s => ({ ...s, effective_from: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Fecha fin (opcional)</Label>
                    <Input
                        type="date"
                        value={state.effective_to}
                        onChange={(e) => setState(s => ({ ...s, effective_to: e.target.value }))}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                    value={state.status}
                    onValueChange={(v) => setState(s => ({ ...s, status: v as DietPlanStatus }))}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="draft">Borrador</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Tipos de día a configurar</Label>
                <div className="flex gap-4 pt-2">
                    {DAY_TYPES.map(dt => (
                        <div key={dt.value} className="flex items-center gap-2">
                            <Checkbox
                                id={dt.value}
                                checked={state.dayTypes.includes(dt.value)}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        setState(s => ({ ...s, dayTypes: [...s.dayTypes, dt.value] }))
                                    } else if (state.dayTypes.length > 1) {
                                        setState(s => ({
                                            ...s,
                                            dayTypes: s.dayTypes.filter(d => d !== dt.value),
                                            meals: s.meals.filter(m => m.day_type !== dt.value),
                                        }))
                                    }
                                }}
                            />
                            <label htmlFor={dt.value} className="text-sm">{dt.label}</label>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// STEP 2: MEALS
// ============================================================================

function Step2Meals({
    state,
    setState,
}: {
    state: WizardState
    setState: React.Dispatch<React.SetStateAction<WizardState>>
}) {
    const getMealsForDayType = (dt: DayType) =>
        state.meals.filter(m => m.day_type === dt).sort((a, b) => a.order_index - b.order_index)

    const addMeal = (dt: DayType) => {
        const meals = getMealsForDayType(dt)
        const newMeal: DietMealInput = {
            day_type: dt,
            name: `Comida ${meals.length + 1}`,
            order_index: meals.length,
            options: [createEmptyOption(0)],
        }
        setState(s => ({ ...s, meals: [...s.meals, newMeal] }))
    }

    const removeMeal = (dt: DayType, orderIdx: number) => {
        setState(s => ({
            ...s,
            meals: s.meals
                .filter(m => !(m.day_type === dt && m.order_index === orderIdx))
                .map(m => {
                    if (m.day_type === dt && m.order_index > orderIdx) {
                        return { ...m, order_index: m.order_index - 1 }
                    }
                    return m
                }),
        }))
    }

    const updateMealName = (dt: DayType, orderIdx: number, name: string) => {
        setState(s => ({
            ...s,
            meals: s.meals.map(m =>
                m.day_type === dt && m.order_index === orderIdx ? { ...m, name } : m
            ),
        }))
    }

    const moveMeal = (dt: DayType, orderIdx: number, direction: 'up' | 'down') => {
        const meals = getMealsForDayType(dt)
        const newOrder = direction === 'up' ? orderIdx - 1 : orderIdx + 1
        if (newOrder < 0 || newOrder >= meals.length) return

        setState(s => ({
            ...s,
            meals: s.meals.map(m => {
                if (m.day_type !== dt) return m
                if (m.order_index === orderIdx) return { ...m, order_index: newOrder }
                if (m.order_index === newOrder) return { ...m, order_index: orderIdx }
                return m
            }),
        }))
    }

    return (
        <div className="py-4">
            {state.dayTypes.length > 1 ? (
                <Tabs defaultValue={state.dayTypes[0]}>
                    <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${state.dayTypes.length}, 1fr)` }}>
                        {state.dayTypes.map(dt => (
                            <TabsTrigger key={dt} value={dt}>
                                {DAY_TYPES.find(d => d.value === dt)?.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {state.dayTypes.map(dt => (
                        <TabsContent key={dt} value={dt}>
                            <MealsEditor
                                meals={getMealsForDayType(dt)}
                                onAdd={() => addMeal(dt)}
                                onRemove={orderIdx => removeMeal(dt, orderIdx)}
                                onUpdateName={(orderIdx, name) => updateMealName(dt, orderIdx, name)}
                                onMove={(orderIdx, dir) => moveMeal(dt, orderIdx, dir)}
                            />
                        </TabsContent>
                    ))}
                </Tabs>
            ) : (
                <MealsEditor
                    meals={getMealsForDayType(state.dayTypes[0])}
                    onAdd={() => addMeal(state.dayTypes[0])}
                    onRemove={orderIdx => removeMeal(state.dayTypes[0], orderIdx)}
                    onUpdateName={(orderIdx, name) => updateMealName(state.dayTypes[0], orderIdx, name)}
                    onMove={(orderIdx, dir) => moveMeal(state.dayTypes[0], orderIdx, dir)}
                />
            )}
        </div>
    )
}

function MealsEditor({
    meals,
    onAdd,
    onRemove,
    onUpdateName,
    onMove,
}: {
    meals: DietMealInput[]
    onAdd: () => void
    onRemove: (order_index: number) => void
    onUpdateName: (order_index: number, name: string) => void
    onMove: (order_index: number, direction: 'up' | 'down') => void
}) {
    return (
        <div className="space-y-2 pt-4">
            {meals.map((meal, idx) => (
                <Card key={idx} className="p-3 flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Input
                        value={meal.name}
                        onChange={(e) => onUpdateName(meal.order_index, e.target.value)}
                        className="flex-1"
                    />
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onMove(meal.order_index, 'up')}
                            disabled={idx === 0}
                        >
                            <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onMove(meal.order_index, 'down')}
                            disabled={idx === meals.length - 1}
                        >
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemove(meal.order_index)}
                            disabled={meals.length <= 1}
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </Card>
            ))}
            <Button variant="outline" className="w-full" onClick={onAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Añadir comida
            </Button>
        </div>
    )
}

// ============================================================================
// STEP 3: OPTIONS & ITEMS
// ============================================================================

function Step3Options({
    state,
    setState,
}: {
    state: WizardState
    setState: React.Dispatch<React.SetStateAction<WizardState>>
}) {
    const getMealsForDayType = (dt: DayType) =>
        state.meals.filter(m => m.day_type === dt).sort((a, b) => a.order_index - b.order_index)

    const updateMeal = (dt: DayType, mealOrder: number, updatedMeal: DietMealInput) => {
        setState(s => ({
            ...s,
            meals: s.meals.map(m =>
                m.day_type === dt && m.order_index === mealOrder ? updatedMeal : m
            ),
        }))
    }

    return (
        <div className="py-4 space-y-4">
            {state.dayTypes.length > 1 ? (
                <Tabs defaultValue={state.dayTypes[0]}>
                    <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${state.dayTypes.length}, 1fr)` }}>
                        {state.dayTypes.map(dt => (
                            <TabsTrigger key={dt} value={dt}>
                                {DAY_TYPES.find(d => d.value === dt)?.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {state.dayTypes.map(dt => (
                        <TabsContent key={dt} value={dt} className="space-y-4">
                            {getMealsForDayType(dt).map(meal => (
                                <MealOptionsEditor
                                    key={meal.order_index}
                                    meal={meal}
                                    onUpdate={(updated) => updateMeal(dt, meal.order_index, updated)}
                                />
                            ))}
                        </TabsContent>
                    ))}
                </Tabs>
            ) : (
                <div className="space-y-4">
                    {getMealsForDayType(state.dayTypes[0]).map(meal => (
                        <MealOptionsEditor
                            key={meal.order_index}
                            meal={meal}
                            onUpdate={(updated) => updateMeal(state.dayTypes[0], meal.order_index, updated)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function MealOptionsEditor({
    meal,
    onUpdate,
}: {
    meal: DietMealInput
    onUpdate: (meal: DietMealInput) => void
}) {
    const addOption = () => {
        const newOption = createEmptyOption(meal.options.length)
        onUpdate({ ...meal, options: [...meal.options, newOption] })
    }

    const removeOption = (orderIdx: number) => {
        if (meal.options.length <= 1) return
        onUpdate({
            ...meal,
            options: meal.options
                .filter(o => o.order_index !== orderIdx)
                .map((o, idx) => ({ ...o, order_index: idx })),
        })
    }

    const updateOption = (orderIdx: number, updated: DietMealOptionInput) => {
        onUpdate({
            ...meal,
            options: meal.options.map(o => (o.order_index === orderIdx ? updated : o)),
        })
    }

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">{meal.name}</h4>
                <Badge variant="secondary">{meal.options.length} opciones</Badge>
            </div>

            <div className="space-y-3">
                {meal.options.map(option => (
                    <OptionEditor
                        key={option.order_index}
                        option={option}
                        onUpdate={(updated) => updateOption(option.order_index, updated)}
                        onRemove={() => removeOption(option.order_index)}
                        canRemove={meal.options.length > 1}
                    />
                ))}
            </div>

            <Button variant="outline" size="sm" className="w-full mt-3" onClick={addOption}>
                <Plus className="h-4 w-4 mr-1" />
                Añadir opción
            </Button>
        </Card>
    )
}

function OptionEditor({
    option,
    onUpdate,
    onRemove,
    canRemove,
}: {
    option: DietMealOptionInput
    onUpdate: (option: DietMealOptionInput) => void
    onRemove: () => void
    canRemove: boolean
}) {
    const addItem = () => {
        const newItem: DietOptionItemInput = {
            item_type: 'food',
            name: '',
            quantity_value: null,
            quantity_unit: 'g',
            notes: '',
            order_index: option.items.length,
        }
        onUpdate({ ...option, items: [...option.items, newItem] })
    }

    const removeItem = (orderIdx: number) => {
        if (option.items.length <= 1) return
        onUpdate({
            ...option,
            items: option.items
                .filter(i => i.order_index !== orderIdx)
                .map((i, idx) => ({ ...i, order_index: idx })),
        })
    }

    const updateItem = (orderIdx: number, updated: DietOptionItemInput) => {
        onUpdate({
            ...option,
            items: option.items.map(i => (i.order_index === orderIdx ? updated : i)),
        })
    }

    return (
        <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
                <Input
                    value={option.name}
                    onChange={(e) => onUpdate({ ...option, name: e.target.value })}
                    placeholder="Nombre de la opción"
                    className="flex-1"
                />
                {canRemove && (
                    <Button variant="ghost" size="icon" onClick={onRemove} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="space-y-2">
                {option.items.map(item => (
                    <ItemEditor
                        key={item.order_index}
                        item={item}
                        onUpdate={(updated) => updateItem(item.order_index, updated)}
                        onRemove={() => removeItem(item.order_index)}
                        canRemove={option.items.length > 1}
                    />
                ))}
            </div>

            <Button variant="ghost" size="sm" className="w-full mt-2" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Añadir item
            </Button>

            <div className="mt-2">
                <Input
                    value={option.notes || ''}
                    onChange={(e) => onUpdate({ ...option, notes: e.target.value })}
                    placeholder="Notas de la opción (opcional)"
                    className="text-sm"
                />
            </div>
        </div>
    )
}

function ItemEditor({
    item,
    onUpdate,
    onRemove,
    canRemove,
}: {
    item: DietOptionItemInput
    onUpdate: (item: DietOptionItemInput) => void
    onRemove: () => void
    canRemove: boolean
}) {
    return (
        <div className="flex items-center gap-2">
            <Select
                value={item.item_type}
                onValueChange={(v) => onUpdate({ ...item, item_type: v as ItemType })}
            >
                <SelectTrigger className="w-24">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="food">Comida</SelectItem>
                    <SelectItem value="free_text">Libre</SelectItem>
                    <SelectItem value="rule">Regla</SelectItem>
                </SelectContent>
            </Select>

            <Input
                type="number"
                value={item.quantity_value ?? ''}
                onChange={(e) => onUpdate({ ...item, quantity_value: e.target.value ? Number(e.target.value) : null })}
                placeholder="Cant"
                className="w-20"
            />

            <Input
                value={item.quantity_unit || ''}
                onChange={(e) => onUpdate({ ...item, quantity_unit: e.target.value })}
                placeholder="Ud"
                className="w-16"
            />

            <Input
                value={item.name}
                onChange={(e) => onUpdate({ ...item, name: e.target.value })}
                placeholder="Nombre del alimento"
                className="flex-1"
            />

            {canRemove && (
                <Button variant="ghost" size="icon" onClick={onRemove} className="text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    )
}

// ============================================================================
// HELPERS
// ============================================================================

function getInitialState(): WizardState {
    return {
        name: '',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        status: 'active',
        dayTypes: ['default'],
        meals: [],
    }
}

function createEmptyOption(orderIdx: number): DietMealOptionInput {
    return {
        name: `Opción ${orderIdx + 1}`,
        order_index: orderIdx,
        notes: '',
        items: [
            {
                item_type: 'food',
                name: '',
                quantity_value: null,
                quantity_unit: 'g',
                notes: '',
                order_index: 0,
            },
        ],
    }
}

// Helper to safely get item name (normalizing DB inconsistencies)
function safeItemName(item: any): string {
    return String(item?.name ?? item?.food_name ?? '').trim()
}

function canProceed(step: number, state: WizardState): boolean {
    if (step === 1) {
        return state.name.trim() !== '' && state.dayTypes.length > 0
    }
    return true
}

function isValid(state: WizardState): boolean {
    if (!state.name.trim()) return false
    if (state.meals.length === 0) return false

    for (const meal of state.meals) {
        if (meal.options.length === 0) return false
        for (const option of meal.options) {
            if (option.items.length === 0) return false
            for (const item of option.items) {
                // Use safe helper to avoid crash on undefined name
                if (safeItemName(item).length === 0) return false
            }
        }
    }
    return true
}
