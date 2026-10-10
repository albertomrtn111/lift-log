import type { DietMealInput } from '@/data/nutrition/types'

export type AINutritionMode = 'generate' | 'modify'

export interface AIMacrosProposal {
    type: 'macros'
    mode: AINutritionMode
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps?: number | null
    notes: string
    explanation: string
    change_summary: string[]
}

/** Cómo cuadra cada opción con el objetivo de su comida tras el ajuste */
export interface AIDietOptionFit {
    meal: string
    option: string
    status: 'ok' | 'warn' | 'off' | 'none'
}

export interface AIDietProposal {
    type: 'options_diet'
    mode: AINutritionMode
    name: string
    /** Ya en formato de guardado: alimentos vinculados, gramos, macros y objetivos */
    meals: DietMealInput[]
    fit?: AIDietOptionFit[]
    explanation: string
    change_summary: string[]
    structure_strategy: 'maintain' | 'adjust' | 'rebuild'
}

export type AINutritionProposal = AIMacrosProposal | AIDietProposal
