// Ajuste automático de carbohidratos en los planes de macros: los carbos
// completan las kcal que dejan libres la proteína y la grasa. Puro, para
// probarlo con node --test.

export interface MacroTargets {
    kcal: number
    protein: number
    carbs: number
    fat: number
}

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

/** Margen para considerar que las kcal cuadran con los macros (≈ 2-3 g de carbos) */
export const BALANCE_TOLERANCE_KCAL = 10

function safe(value: number) {
    return Number.isFinite(value) && value > 0 ? value : 0
}

/** Kcal que aportan los macros (P y C a 4 kcal/g, G a 9) */
export function macroKcal({ protein, carbs, fat }: Pick<MacroTargets, 'protein' | 'carbs' | 'fat'>) {
    return safe(protein) * KCAL_PER_GRAM.protein + safe(carbs) * KCAL_PER_GRAM.carbs + safe(fat) * KCAL_PER_GRAM.fat
}

/**
 * Carbohidratos que completan las kcal objetivo. Si proteína y grasa ya las
 * superan, los carbos quedan en 0 y `overflowKcal` indica el exceso.
 */
export function autofitCarbs({ kcal, protein, fat }: Pick<MacroTargets, 'kcal' | 'protein' | 'fat'>) {
    const free = safe(kcal) - safe(protein) * KCAL_PER_GRAM.protein - safe(fat) * KCAL_PER_GRAM.fat
    return {
        carbs: free > 0 ? Math.round(free / KCAL_PER_GRAM.carbs) : 0,
        overflowKcal: free < 0 ? Math.round(-free) : 0,
    }
}

/** Aplica el ajuste a unos macros completos */
export function withAutofitCarbs<T extends MacroTargets>(values: T): T {
    return { ...values, carbs: autofitCarbs(values).carbs }
}

/** Diferencia entre lo que suman los macros y las kcal objetivo (positiva = sobran macros) */
export function kcalGap(values: MacroTargets) {
    return Math.round(macroKcal(values) - safe(values.kcal))
}

export function isBalanced(values: MacroTargets, tolerance = BALANCE_TOLERANCE_KCAL) {
    return Math.abs(kcalGap(values)) <= tolerance
}
