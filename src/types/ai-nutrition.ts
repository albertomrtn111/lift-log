export interface AIMacrosProposal {
    type: 'macros'
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps?: number | null
    notes: string
    explanation: string
}

export interface AIDietItemProposal {
    item_type: 'food' | 'free_text'
    name: string
    quantity_value?: number | null
    quantity_unit?: string | null
    notes: string
    order_index: number
}

export interface AIDietOptionProposal {
    name: string
    order_index: number
    notes: string
    items: AIDietItemProposal[]
}

export interface AIDietMealProposal {
    day_type: 'default' | 'training' | 'rest'
    name: string
    order_index: number
    options: AIDietOptionProposal[]
}

export interface AIDietProposal {
    type: 'options_diet'
    name: string
    meals: AIDietMealProposal[]
    explanation: string
}

export type AINutritionProposal = AIMacrosProposal | AIDietProposal
