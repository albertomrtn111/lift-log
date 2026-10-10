// Modelo de la dieta por opciones basada en macros (editor del coach e IA).
//
// El editor trabaja con los tipos de entrada de la capa de datos más el alimento
// completo (para calcular macros en vivo) y dos marcas que solo existen mientras
// se edita: `unit_based` (se prescribe en unidades) y `locked` (no lo toca
// "Ajustar al objetivo").

import {
    adjustOptionToTarget,
    defaultEquivalenceBasis,
    equivalentGrams,
    itemMacros,
    optionTotals,
    syncAlternatives,
    toGrams,
} from '@/lib/nutrition/diet-macros'
import type {
    DayType,
    DietFoodRef,
    DietMealInput,
    DietMealOptionInput,
    DietMealWithOptions,
    DietOptionItemInput,
} from '@/data/nutrition/types'

export interface EditorItem extends DietOptionItemInput {
    /** Clave estable para React (no se guarda) */
    key: string
    food?: DietFoodRef | null
    unit_based?: boolean
    locked?: boolean
}

export interface EditorOption extends Omit<DietMealOptionInput, 'items'> {
    key: string
    items: EditorItem[]
}

export interface EditorMeal extends Omit<DietMealInput, 'options'> {
    options: EditorOption[]
}

export interface MealTarget {
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
}

export function newKey() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function mealTarget(meal: EditorMeal | DietMealInput): MealTarget {
    return {
        kcal: meal.target_kcal ?? null,
        protein_g: meal.target_protein_g ?? null,
        carbs_g: meal.target_carbs_g ?? null,
        fat_g: meal.target_fat_g ?? null,
    }
}

export function hasTarget(target: MealTarget) {
    return [target.kcal, target.protein_g, target.carbs_g, target.fat_g].some(value => Number(value) > 0)
}

/** kcal que salen de P/C/G (4/4/9) */
export function kcalFromMacros(target: Pick<MealTarget, 'protein_g' | 'carbs_g' | 'fat_g'>) {
    const p = Number(target.protein_g) || 0
    const c = Number(target.carbs_g) || 0
    const f = Number(target.fat_g) || 0
    return Math.round(p * 4 + c * 4 + f * 9)
}

/** Objetivo efectivo: si no hay kcal pero sí macros, se deducen */
export function effectiveTarget(target: MealTarget): MealTarget {
    if (Number(target.kcal) > 0) return target
    const derived = kcalFromMacros(target)
    return derived > 0 ? { ...target, kcal: derived } : target
}

// ---------------------------------------------------------------------------
// Ítems
// ---------------------------------------------------------------------------

export function createFoodItem(food: DietFoodRef, orderIndex: number, grams?: number): EditorItem {
    const unitBased = Boolean(food.unit_weight_g)
    const quantity = grams ?? (unitBased ? Number(food.unit_weight_g) : 100)
    return {
        key: newKey(),
        item_type: 'food',
        name: food.name,
        food,
        food_id: food.id,
        quantity_g: quantity,
        unit_based: unitBased,
        quantity_value: null,
        quantity_unit: null,
        notes: '',
        order_index: orderIndex,
        is_alternative: false,
        alternative_group: null,
    }
}

export function createTextItem(orderIndex: number): EditorItem {
    return {
        key: newKey(),
        item_type: 'food',
        name: '',
        food: null,
        food_id: null,
        quantity_g: null,
        quantity_value: null,
        quantity_unit: '',
        notes: '',
        order_index: orderIndex,
        is_alternative: false,
        alternative_group: null,
    }
}

export function createEmptyOption(orderIndex: number): EditorOption {
    return {
        key: newKey(),
        name: `Opción ${orderIndex + 1}`,
        order_index: orderIndex,
        notes: '',
        items: [],
    }
}

/** Cambia el alimento de un ítem conservando sus gramos o unidades */
export function replaceFood(item: EditorItem, food: DietFoodRef): EditorItem {
    const unitBased = Boolean(food.unit_weight_g) && Boolean(item.unit_based || !item.food)
    let grams = item.quantity_g ?? null
    if (unitBased && item.unit_based && item.food?.unit_weight_g && grams) {
        grams = (grams / Number(item.food.unit_weight_g)) * Number(food.unit_weight_g)
    }
    if (grams === null) grams = toGrams(item.quantity_value, item.quantity_unit, food) ?? (unitBased ? Number(food.unit_weight_g) : 100)
    return { ...item, food, food_id: food.id, name: food.name, quantity_g: grams, unit_based: unitBased }
}

/** Añade una alternativa equivalente al ítem de referencia */
export function addAlternative(option: EditorOption, referenceKey: string, food: DietFoodRef): EditorOption {
    const reference = option.items.find(item => item.key === referenceKey)
    if (!reference?.food || !reference.quantity_g) return option

    const usedGroups = option.items
        .map(item => item.alternative_group)
        .filter((group): group is number => group !== null && group !== undefined)
    const group = reference.alternative_group ?? (usedGroups.length > 0 ? Math.max(...usedGroups) + 1 : 1)
    const basis = defaultEquivalenceBasis(reference.food)
    const grams = equivalentGrams(reference.food, reference.quantity_g, food, basis, {
        preferUnits: Boolean(food.unit_weight_g) && Boolean(reference.unit_based),
    })

    const alternative: EditorItem = {
        ...createFoodItem(food, 0, grams ?? undefined),
        is_alternative: true,
        alternative_group: group,
        equivalence_basis: basis,
        unit_based: Boolean(food.unit_weight_g) && Boolean(reference.unit_based),
    }

    // La alternativa va justo después del último ítem de su grupo
    const items = option.items.map(item => (item.key === referenceKey ? { ...item, alternative_group: group } : item))
    const lastIndex = items.reduce((last, item, index) => (item.alternative_group === group ? index : last), -1)
    items.splice(lastIndex + 1, 0, alternative)
    return { ...option, items: reindex(items) }
}

/** Quita un ítem; si era referencia de un grupo, la primera alternativa pasa a serlo */
export function removeItem(option: EditorOption, key: string): EditorOption {
    const removed = option.items.find(item => item.key === key)
    let items = option.items.filter(item => item.key !== key)

    if (removed && removed.alternative_group !== null && removed.alternative_group !== undefined && !removed.is_alternative) {
        const group = removed.alternative_group
        const nextReference = items.find(item => item.alternative_group === group)
        if (nextReference) {
            items = items.map(item => (item.key === nextReference.key ? { ...item, is_alternative: false, equivalence_basis: null } : item))
        }
    }

    // Un grupo con un solo ítem deja de ser grupo
    const counts = new Map<number, number>()
    items.forEach(item => {
        if (item.alternative_group !== null && item.alternative_group !== undefined) {
            counts.set(item.alternative_group, (counts.get(item.alternative_group) ?? 0) + 1)
        }
    })
    items = items.map(item =>
        item.alternative_group !== null && item.alternative_group !== undefined && counts.get(item.alternative_group) === 1
            ? { ...item, alternative_group: null, is_alternative: false, equivalence_basis: null }
            : item
    )

    return { ...option, items: reindex(items) }
}

/** Actualiza un ítem y recalcula las alternativas de su grupo */
export function updateItem(option: EditorOption, key: string, patch: Partial<EditorItem>): EditorOption {
    const items = option.items.map(item => (item.key === key ? { ...item, ...patch } : item))
    return { ...option, items: syncAlternatives(items) as EditorItem[] }
}

export function reindex(items: EditorItem[]): EditorItem[] {
    return items.map((item, index) => ({ ...item, order_index: index }))
}

export function adjustOption(option: EditorOption, target: MealTarget) {
    const result = adjustOptionToTarget(option.items, effectiveTarget(target))
    return { option: { ...option, items: result.items as EditorItem[] }, changed: result.changed }
}

export function optionSummary(option: EditorOption) {
    return optionTotals(option.items)
}

export { itemMacros }

// ---------------------------------------------------------------------------
// Carga desde la base de datos y guardado
// ---------------------------------------------------------------------------

const COUNT_UNITS = new Set(['unidad', 'unidades', 'uds', 'ud', 'u', 'ración', 'racion', 'lata', 'latas',
    'rebanada', 'rebanadas', 'rbn', 'onza', 'onzas', 'taza'])

export function mealsFromStructure(meals: DietMealWithOptions[]): EditorMeal[] {
    return meals.map(meal => ({
        day_type: meal.day_type as DayType,
        name: meal.name,
        order_index: meal.order_index,
        target_kcal: numberOrNull(meal.target_kcal),
        target_protein_g: numberOrNull(meal.target_protein_g),
        target_carbs_g: numberOrNull(meal.target_carbs_g),
        target_fat_g: numberOrNull(meal.target_fat_g),
        options: meal.options.map(option => ({
            key: newKey(),
            name: option.name,
            order_index: option.order_index,
            notes: option.notes,
            items: option.items.map(item => {
                const food = item.food ?? null
                const unit = String(item.quantity_unit ?? '').trim().toLowerCase()
                const quantityG = item.quantity_g ?? (food ? toGrams(item.quantity_value, item.quantity_unit, food) : null)
                return {
                    key: newKey(),
                    item_type: 'food' as const,
                    name: String(item.name ?? '').trim(),
                    quantity_value: item.quantity_value ?? null,
                    quantity_unit: item.quantity_unit ?? null,
                    notes: item.notes ?? '',
                    order_index: item.order_index,
                    food,
                    food_id: food?.id ?? item.food_id ?? null,
                    quantity_g: quantityG,
                    unit_based: Boolean(food?.unit_weight_g) && COUNT_UNITS.has(unit),
                    alternative_group: item.alternative_group ?? null,
                    is_alternative: Boolean(item.is_alternative),
                    equivalence_basis: item.equivalence_basis ?? null,
                }
            }),
        })),
    }))
}

function numberOrNull(value: unknown) {
    return value === null || value === undefined || value === '' ? null : Number(value)
}

function formatQuantityNumber(value: number) {
    return Math.round(value * 10) / 10
}

/**
 * Convierte el estado del editor en la entrada de la capa de datos:
 * calcula macros, rellena la cantidad legible (para el JSON del cliente) y
 * descarta las marcas de edición.
 */
export function mealsToInput(meals: EditorMeal[]): DietMealInput[] {
    return meals.map(meal => {
        const target = mealTarget(meal)
        const derivedKcal = !(Number(target.kcal) > 0) && hasTarget(target) ? kcalFromMacros(target) : null
        return {
            day_type: meal.day_type,
            name: meal.name.trim(),
            order_index: meal.order_index,
            target_kcal: derivedKcal ?? target.kcal,
            target_protein_g: target.protein_g,
            target_carbs_g: target.carbs_g,
            target_fat_g: target.fat_g,
            options: meal.options.map((option, optionIndex) => ({
                name: option.name.trim() || `Opción ${optionIndex + 1}`,
                order_index: optionIndex,
                notes: option.notes,
                items: option.items
                    .filter(item => item.name.trim() || item.food)
                    .map((item, itemIndex) => {
                        const macros = itemMacros(item)
                        const food = item.food
                        let quantityValue = item.quantity_value ?? null
                        let quantityUnit = item.quantity_unit ?? null
                        if (food && item.quantity_g !== null && item.quantity_g !== undefined) {
                            if (item.unit_based && food.unit_weight_g) {
                                quantityValue = formatQuantityNumber(item.quantity_g / Number(food.unit_weight_g))
                                quantityUnit = food.unit_label || 'unidad'
                            } else {
                                quantityValue = formatQuantityNumber(item.quantity_g)
                                quantityUnit = 'g'
                            }
                        }
                        return {
                            item_type: 'food' as const,
                            name: (food?.name ?? item.name).trim(),
                            quantity_value: quantityValue,
                            quantity_unit: quantityUnit,
                            notes: item.notes ?? '',
                            order_index: itemIndex,
                            food_id: food?.id ?? null,
                            quantity_g: food ? item.quantity_g ?? null : null,
                            kcal: macros?.kcal ?? null,
                            protein_g: macros?.protein_g ?? null,
                            carbs_g: macros?.carbs_g ?? null,
                            fat_g: macros?.fat_g ?? null,
                            alternative_group: item.alternative_group ?? null,
                            is_alternative: Boolean(item.is_alternative),
                            equivalence_basis: item.equivalence_basis ?? null,
                        }
                    }),
            })),
        }
    })
}
