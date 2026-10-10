// Convierte la propuesta de la IA en una dieta por opciones cuadrada a macros.
//
// La IA elige alimentos de la base de datos (por código) y cantidades
// orientativas; los números los cierra este código: objetivos por comida que
// suman exactamente el plan diario, gramos ajustados por el motor de macros y
// alternativas equivalentes. Los modelos de lenguaje calculan mal: aquí no se
// confía en sus sumas.

import { compareToTarget } from '@/lib/nutrition/diet-macros'
import {
    adjustOption,
    createEmptyOption,
    createFoodItem,
    createTextItem,
    effectiveTarget,
    hasTarget,
    mealTarget,
    mealsToInput,
    optionSummary,
    reindex,
    type EditorItem,
    type EditorMeal,
    type EditorOption,
    type MealTarget,
} from '@/lib/nutrition/diet-plan-model'
import { defaultEquivalenceBasis, syncAlternatives } from '@/lib/nutrition/diet-macros'
import type { DayType, DietFoodRef, DietMealInput } from '@/data/nutrition/types'

// ---------------------------------------------------------------------------
// Catálogo para el prompt
// ---------------------------------------------------------------------------

const GROUP_LABEL: Record<string, string> = {
    protein: 'proteína',
    carbs: 'hidratos',
    fat: 'grasa',
    fruit: 'fruta',
    vegetable: 'verdura',
    dairy: 'lácteo',
    other: 'otros',
}

function fmt(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function buildFoodCatalogPrompt(foods: DietFoodRef[]) {
    const codeToFood = new Map<string, DietFoodRef>()
    const lines: string[] = []
    const sorted = [...foods].sort((a, b) =>
        (a.food_group ?? 'zz').localeCompare(b.food_group ?? 'zz') || a.name.localeCompare(b.name, 'es')
    )
    sorted.forEach((food, index) => {
        const code = `F${index + 1}`
        codeToFood.set(code, food)
        const base = food.serving_size_g && food.serving_size_g !== 100 ? `/${food.serving_size_g}g` : '/100g'
        const unit = food.unit_weight_g ? ` | 1 ${food.unit_label ?? 'ud'}=${fmt(food.unit_weight_g)}g` : ''
        lines.push(
            `${code} | ${food.name}${food.brand ? ` (${food.brand})` : ''} | ${GROUP_LABEL[food.food_group ?? 'other'] ?? 'otros'} | ` +
            `${fmt(food.kcal)}kcal P${fmt(food.protein_g)} C${fmt(food.carbs_g)} G${fmt(food.fat_g)} ${base}${unit}`
        )
    })
    return { text: lines.join('\n'), codeToFood }
}

// ---------------------------------------------------------------------------
// Respuesta de la IA
// ---------------------------------------------------------------------------

export interface AIDietRawItem {
    food: string | null
    name: string
    grams?: number | null
    free_quantity?: string | null
    alt_group?: number | null
    notes?: string
}

export interface AIDietRawOption {
    name: string
    notes?: string
    items: AIDietRawItem[]
}

export interface AIDietRawMeal {
    day_type: 'default' | 'training' | 'rest'
    name: string
    target?: { kcal?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null } | null
    options: AIDietRawOption[]
}

export interface DailyTargets {
    default?: MealTarget | null
    training?: MealTarget | null
    rest?: MealTarget | null
}

export interface OptionFit {
    meal: string
    option: string
    status: 'ok' | 'warn' | 'off' | 'none'
}

const MACRO_FIELDS = ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const

/**
 * Reparte el objetivo diario entre las comidas respetando las proporciones que
 * propuso la IA, para que la suma sea exacta. Las comidas sin objetivo reciben
 * una parte igual de lo que falte.
 */
export function distributeDailyTarget(meals: { target: MealTarget }[], daily: MealTarget | null | undefined): MealTarget[] {
    if (!daily || !hasTarget(daily)) return meals.map(meal => meal.target)
    const result = meals.map(meal => ({ ...meal.target }))

    for (const key of MACRO_FIELDS) {
        const goal = Number(daily[key])
        if (!(goal > 0)) continue
        const proposed = result.map(target => Number(target[key]) || 0)
        const proposedSum = proposed.reduce((sum, value) => sum + value, 0)
        const shares = proposedSum > 0
            ? proposed.map(value => value / proposedSum)
            : proposed.map(() => 1 / proposed.length)

        const values = shares.map(share => Math.round(goal * share))
        // El redondeo se lo lleva la comida más grande para que la suma sea exacta
        const drift = goal - values.reduce((sum, value) => sum + value, 0)
        const biggest = values.indexOf(Math.max(...values))
        values[biggest] += drift
        values.forEach((value, index) => { result[index][key] = value })
    }
    return result
}

export function buildDietFromAI(
    rawMeals: AIDietRawMeal[],
    codeToFood: Map<string, DietFoodRef>,
    dailyTargets: DailyTargets,
): { meals: DietMealInput[]; fit: OptionFit[]; unknownFoods: string[] } {
    const unknownFoods: string[] = []

    // 1. Ítems y opciones
    const editorMeals: EditorMeal[] = rawMeals.map((rawMeal, mealIndex) => ({
        day_type: rawMeal.day_type as DayType,
        name: rawMeal.name.trim() || `Comida ${mealIndex + 1}`,
        order_index: 0,
        target_kcal: positiveOrNull(rawMeal.target?.kcal),
        target_protein_g: positiveOrNull(rawMeal.target?.protein_g),
        target_carbs_g: positiveOrNull(rawMeal.target?.carbs_g),
        target_fat_g: positiveOrNull(rawMeal.target?.fat_g),
        options: rawMeal.options.map((rawOption, optionIndex) => {
            const option: EditorOption = { ...createEmptyOption(optionIndex), name: rawOption.name || `Opción ${optionIndex + 1}`, notes: rawOption.notes ?? '' }
            option.items = buildItems(rawOption.items, codeToFood, unknownFoods)
            return option
        }),
    }))

    // order_index por tipo de día (la tabla exige que sea único por plan y tipo)
    const counters = new Map<string, number>()
    for (const meal of editorMeals) {
        const next = counters.get(meal.day_type) ?? 0
        meal.order_index = next
        counters.set(meal.day_type, next + 1)
    }

    // 2. Objetivos por comida que suman exactamente el plan diario
    for (const dayType of new Set(editorMeals.map(meal => meal.day_type))) {
        const group = editorMeals.filter(meal => meal.day_type === dayType)
        const daily = dailyTargets[dayType as keyof DailyTargets] ?? dailyTargets.default ?? null
        const distributed = distributeDailyTarget(group.map(meal => ({ target: mealTarget(meal) })), daily)
        group.forEach((meal, index) => {
            const target = distributed[index]
            meal.target_kcal = positiveOrNull(target.kcal)
            meal.target_protein_g = positiveOrNull(target.protein_g)
            meal.target_carbs_g = positiveOrNull(target.carbs_g)
            meal.target_fat_g = positiveOrNull(target.fat_g)
        })
    }

    // 3. Cuadre de cada opción con el motor
    const fit: OptionFit[] = []
    for (const meal of editorMeals) {
        const target = mealTarget(meal)
        meal.options = meal.options.map(option => {
            const adjusted = hasTarget(target) ? adjustOption(option, target).option : option
            const { status } = compareToTarget(optionSummary(adjusted), effectiveTarget(target))
            fit.push({ meal: meal.name, option: adjusted.name, status })
            return adjusted
        })
    }

    return { meals: mealsToInput(editorMeals), fit, unknownFoods }
}

function positiveOrNull(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function buildItems(rawItems: AIDietRawItem[], codeToFood: Map<string, DietFoodRef>, unknownFoods: string[]): EditorItem[] {
    const items: EditorItem[] = []
    const seenGroups = new Set<number>()

    rawItems.forEach((raw, index) => {
        const code = raw.food?.trim().toUpperCase() ?? null
        const food = code ? codeToFood.get(code) ?? null : null

        if (code && !food) unknownFoods.push(`${code} (${raw.name})`)

        if (!food) {
            // Texto libre: no cuenta en macros ("Verdura libre", "Café", "Especias")
            const text = createTextItem(index)
            text.name = raw.name.trim()
            text.quantity_unit = raw.free_quantity?.trim() || ''
            text.notes = raw.notes ?? ''
            items.push(text)
            return
        }

        const grams = Number(raw.grams) > 0 ? Number(raw.grams) : (food.unit_weight_g ?? 100)
        const item = createFoodItem(food, index, grams)
        item.notes = raw.notes ?? ''
        // Lo que tiene peso por unidad se muestra en unidades si la cantidad es redonda
        item.unit_based = Boolean(food.unit_weight_g) && Math.abs(grams / Number(food.unit_weight_g) - Math.round(grams / Number(food.unit_weight_g))) < 0.01

        const group = Number(raw.alt_group)
        if (Number.isInteger(group) && group > 0) {
            item.alternative_group = group
            item.is_alternative = seenGroups.has(group)
            seenGroups.add(group)
        }
        items.push(item)
    })

    // Grupos con un solo alimento no son alternativas; el resto se calcula por equivalencia
    const counts = new Map<number, number>()
    items.forEach(item => {
        if (item.alternative_group != null) counts.set(item.alternative_group, (counts.get(item.alternative_group) ?? 0) + 1)
    })
    const references = new Map<number, EditorItem>()
    const normalized = items.map(item => {
        if (item.alternative_group == null) return item
        if (counts.get(item.alternative_group) === 1) return { ...item, alternative_group: null, is_alternative: false }
        if (!item.is_alternative) {
            references.set(item.alternative_group, item)
            return item
        }
        const reference = references.get(item.alternative_group)
        return { ...item, equivalence_basis: defaultEquivalenceBasis(reference?.food ?? item.food) }
    })

    return reindex(syncAlternatives(normalized) as EditorItem[])
}
