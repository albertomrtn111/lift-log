import type { MuscleGroup } from '@/lib/training/muscle-groups'

export interface CatalogExercise {
    id: string
    name: string
    primary_group: string
    // Nombres históricos ya normalizados (normalizeExerciseName) que apuntan a este ejercicio.
    aliases?: string[]
}

const GROUP_TO_MUSCLE: Record<string, MuscleGroup> = {
    Abdomen: 'abdomen',
    Aductores: 'aductores',
    Bíceps: 'bíceps',
    Cuádriceps: 'cuádriceps',
    Espalda: 'espalda',
    Gemelos: 'gemelos',
    Glúteos: 'glúteo',
    Hombros: 'hombro',
    Isquiotibiales: 'femorales',
    Pecho: 'pecho',
    Tríceps: 'tríceps',
}

// Grupos del catálogo común (exercise_catalog.primary_group). Misma lista y orden que la tabla muscle_groups.
export const CATALOG_GROUPS = [
    'Pecho',
    'Espalda',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Cuádriceps',
    'Isquiotibiales',
    'Glúteos',
    'Aductores',
    'Gemelos',
    'Tibial anterior',
    'Abdomen',
    'Piernas',
    'Cuerpo completo',
    'Cardio',
] as const

export function catalogGroupToMuscleGroup(group: string): MuscleGroup {
    return GROUP_TO_MUSCLE[group] ?? 'otros'
}

// Embed para selects de training_exercises: `exercise_name, ${CATALOG_NAME_EMBED}`.
export const CATALOG_NAME_EMBED = 'exercise_catalog(name)'

type CatalogNameEmbed = { name: string } | { name: string }[] | null | undefined

// Nombre estándar del catálogo si la fila está vinculada; si no, el nombre guardado.
export function exerciseDisplayName(row: {
    exercise_name?: string | null
    exercise_catalog?: CatalogNameEmbed
}): string {
    const embed = Array.isArray(row.exercise_catalog) ? row.exercise_catalog[0] : row.exercise_catalog
    return embed?.name || row.exercise_name || ''
}

export function normalizeExerciseName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es')
        .replace(/\s+/g, ' ')
        .trim()
}

export function findCatalogExercise(
    catalog: CatalogExercise[],
    exercise: { catalog_exercise_id?: string | null; exercise_name?: string | null }
): CatalogExercise | null {
    const byId = exercise.catalog_exercise_id
        ? catalog.find(item => item.id === exercise.catalog_exercise_id)
        : null
    if (byId) return byId
    if (exercise.catalog_exercise_id) return null

    if (!exercise.exercise_name) return null
    const normalizedName = normalizeExerciseName(exercise.exercise_name)
    return catalog.find(item => normalizeExerciseName(item.name) === normalizedName)
        ?? catalog.find(item => item.aliases?.includes(normalizedName))
        ?? null
}

function nameTokens(name: string): string[] {
    return normalizeExerciseName(name).split(/[^a-z0-9]+/).filter(token => token.length >= 3)
}

// Ejercicios del catálogo que comparten la mayoría de palabras con `name`, para avisar antes de crear duplicados.
export function findSimilarCatalogExercises(catalog: CatalogExercise[], name: string, limit = 3): CatalogExercise[] {
    const exact = findCatalogExercise(catalog, { exercise_name: name })
    const tokens = nameTokens(name)
    if (tokens.length === 0) return exact ? [exact] : []

    const scored = catalog
        .filter(item => item.id !== exact?.id)
        .map(item => {
            const itemTokens = nameTokens(item.name)
            const shared = tokens.filter(token => itemTokens.includes(token)).length
            return { item, score: shared / Math.max(tokens.length, itemTokens.length, 1) }
        })
        .filter(entry => entry.score >= 0.5)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'es'))
        .slice(0, exact ? limit - 1 : limit)
        .map(entry => entry.item)

    return exact ? [exact, ...scored] : scored
}
