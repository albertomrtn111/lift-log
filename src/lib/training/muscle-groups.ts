export const MUSCLE_GROUPS = [
    'hombro',
    'pecho',
    'espalda',
    'abdomen',
    'cuádriceps',
    'femorales',
    'gemelos',
    'tríceps',
    'bíceps',
    'glúteo',
    'aductores',
    'otros',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const DEFAULT_MUSCLE_GROUP: MuscleGroup = 'otros'

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
    hombro: 'Hombro',
    pecho: 'Pecho',
    espalda: 'Espalda',
    abdomen: 'Abdomen',
    cuádriceps: 'Cuádriceps',
    femorales: 'Femorales',
    gemelos: 'Gemelos',
    tríceps: 'Tríceps',
    bíceps: 'Bíceps',
    glúteo: 'Glúteo',
    aductores: 'Aductores',
    otros: 'Otros',
}

export function isMuscleGroup(value: string | null | undefined): value is MuscleGroup {
    return !!value && MUSCLE_GROUPS.includes(value as MuscleGroup)
}

export function normalizeMuscleGroup(value: string | null | undefined): MuscleGroup {
    return isMuscleGroup(value) ? value : DEFAULT_MUSCLE_GROUP
}
