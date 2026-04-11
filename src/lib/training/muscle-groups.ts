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

/**
 * Alias map: normalizes English/alternate names → valid MuscleGroup.
 * Keys are lowercase, trimmed, accent-stripped for resilient matching.
 */
const MUSCLE_GROUP_ALIASES: Record<string, MuscleGroup> = {
    // hombro
    shoulder: 'hombro',
    shoulders: 'hombro',
    delt: 'hombro',
    delts: 'hombro',
    deltoid: 'hombro',
    deltoids: 'hombro',
    // pecho
    chest: 'pecho',
    pectoral: 'pecho',
    pectorals: 'pecho',
    pectorales: 'pecho',
    // espalda
    back: 'espalda',
    lat: 'espalda',
    lats: 'espalda',
    latissimus: 'espalda',
    'espalda alta': 'espalda',
    'espalda baja': 'espalda',
    dorsal: 'espalda',
    dorsales: 'espalda',
    // abdomen
    abs: 'abdomen',
    core: 'abdomen',
    abdominals: 'abdomen',
    abdominales: 'abdomen',
    // cuádriceps
    quads: 'cuádriceps',
    quad: 'cuádriceps',
    quadriceps: 'cuádriceps',
    cuadriceps: 'cuádriceps',
    // femorales
    hamstrings: 'femorales',
    hamstring: 'femorales',
    isquios: 'femorales',
    isquiotibiales: 'femorales',
    // gemelos
    calves: 'gemelos',
    calf: 'gemelos',
    gastrocnemius: 'gemelos',
    // tríceps
    triceps: 'tríceps',
    tricep: 'tríceps',
    // bíceps
    biceps: 'bíceps',
    bicep: 'bíceps',
    // glúteo
    glutes: 'glúteo',
    glute: 'glúteo',
    gluteos: 'glúteo',
    gluteus: 'glúteo',
    // aductores
    adductors: 'aductores',
    adductor: 'aductores',
    inner: 'aductores',
}

export function isMuscleGroup(value: string | null | undefined): value is MuscleGroup {
    return !!value && MUSCLE_GROUPS.includes(value as MuscleGroup)
}

/**
 * Normalizes any string (including English aliases, typos, null/undefined)
 * to a valid MuscleGroup. Falls back to DEFAULT_MUSCLE_GROUP ('otros').
 */
export function normalizeMuscleGroup(value: string | null | undefined): MuscleGroup {
    if (!value) return DEFAULT_MUSCLE_GROUP

    // Direct match (already a valid MuscleGroup)
    if (isMuscleGroup(value)) return value

    // Alias lookup: lowercase + trim
    const key = value.toLowerCase().trim()
    if (key in MUSCLE_GROUP_ALIASES) return MUSCLE_GROUP_ALIASES[key]

    // Partial/substring match as last resort
    for (const [alias, group] of Object.entries(MUSCLE_GROUP_ALIASES)) {
        if (key.includes(alias) || alias.includes(key)) return group
    }

    return DEFAULT_MUSCLE_GROUP
}
