/** Reglas de la biblioteca del espacio, sin dependencias para poder probarlas con node --test. */

export const LIBRARY_TEXT_MAX = 60
export const REPS_TEXT_MAX = 20
export const MAX_DEFAULT_SETS = 20

/** Texto opcional: sin espacios sobrantes, y null si queda vacío. */
export function cleanOptionalText(value) {
    const clean = String(value ?? '').replace(/\s+/g, ' ').trim()
    return clean === '' ? null : clean
}

/** Series por defecto: null si no hay, o undefined si el valor no sirve. */
export function parseDefaultSets(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null
    const sets = Number(value)
    return Number.isInteger(sets) && sets >= 1 && sets <= MAX_DEFAULT_SETS ? sets : undefined
}

/**
 * Valida nombre, título y valores por defecto de un ejercicio o un bloque.
 * @param {{ name?: string | null, title?: string | null, sets?: unknown, reps?: string | null }} input
 * @returns {{ error: string } | { values: { name: string | null, title: string | null, sets: number | null, reps: string | null } }}
 */
export function parseLibraryFields({ name, title, sets, reps }) {
    const cleanName = cleanOptionalText(name)
    const cleanTitle = cleanOptionalText(title)
    const cleanReps = cleanOptionalText(reps)
    const parsedSets = parseDefaultSets(sets)
    if ((cleanName?.length ?? 0) > LIBRARY_TEXT_MAX) return { error: 'El nombre es demasiado largo.' }
    if ((cleanTitle?.length ?? 0) > LIBRARY_TEXT_MAX) return { error: 'El título es demasiado largo.' }
    if ((cleanReps?.length ?? 0) > REPS_TEXT_MAX) return { error: 'Las repeticiones son demasiado largas.' }
    if (parsedSets === undefined) return { error: `Las series van de 1 a ${MAX_DEFAULT_SETS}.` }
    return { values: { name: cleanName, title: cleanTitle, sets: parsedSets, reps: cleanReps } }
}

/** Bloques comunes con los cambios del espacio, en el orden del espacio. */
export function mergeBlocks(common, overrides) {
    const byKey = new Map(overrides.map(row => [row.block_key, row]))
    return common
        .map(block => {
            const own = byKey.get(block.key)
            return {
                key: block.key,
                name: block.name,
                displayName: own?.display_name ?? block.name,
                groupTitle: own?.group_title ?? null,
                defaultSets: own?.default_sets ?? null,
                defaultReps: own?.default_reps ?? null,
                isHidden: own?.is_hidden ?? false,
                order: own?.sort_order ?? block.sort_order,
            }
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'))
}

/** Dentro de un bloque: primero el orden manual; lo demás, al final por nombre. */
export function sortEntries(entries) {
    return [...entries].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
            if (a.sortOrder === null) return 1
            if (b.sortOrder === null) return -1
            return a.sortOrder - b.sortOrder
        }
        return a.name.localeCompare(b.name, 'es')
    })
}

/** Lista con el elemento `id` y su vecino intercambiados. Devuelve la misma lista si no se puede. */
export function moveInList(ids, id, delta) {
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return ids
    const next = [...ids]
    next[from] = ids[to]
    next[to] = id
    return next
}

/** Intercambia dos elementos de una lista, estén o no seguidos. */
export function swapInList(ids, first, second) {
    return ids.map(id => (id === first ? second : id === second ? first : id))
}

/** Números de orden con hueco, para que un bloque nuevo caiga cerca de su sitio. */
export function sortOrderFor(index) {
    return (index + 1) * 10
}
