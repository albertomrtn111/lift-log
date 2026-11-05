/** Reglas del catálogo común, sin dependencias para poder probarlas con node --test. */

export const LATERALITIES = ['bilateral', 'unilateral', 'alterno']

export const LATERALITY_LABELS = {
    bilateral: 'Bilateral',
    unilateral: 'Unilateral',
    alterno: 'Alterno',
}

export const EQUIPMENT_LABELS = {
    peso_corporal: 'Peso corporal',
    barra: 'Barra',
    mancuerna: 'Mancuerna',
    kettlebell: 'Kettlebell',
    disco: 'Disco',
    polea: 'Polea',
    maquina: 'Máquina',
    multipower: 'Multipower',
    landmine: 'Landmine',
    goma: 'Goma',
    trx: 'TRX',
    fitball: 'Fitball',
    cajon: 'Cajón',
    rueda: 'Rueda',
    trineo: 'Trineo',
    ergometro: 'Ergómetro',
}

export const BLOCK_CATEGORY_LABELS = {
    movilidad: 'Movilidad',
    core: 'Core',
    prevencion: 'Prevención',
    pliometria: 'Pliometría y potencia',
    carrera: 'Carrera y cambios de dirección',
    fuerza: 'Fuerza',
    metabolico: 'Metabólico',
}

/** Parecido a partir del cual un ejercicio nuevo queda marcado como posible duplicado. */
export const POSSIBLE_DUPLICATE_SCORE = 0.75

export function cleanExerciseName(name) {
    return String(name ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Devuelve el texto del error, o null si los datos sirven.
 * @param {{ name: string, laterality: string, equipment?: string[] }} input
 */
export function validateNewExercise({ name, laterality, equipment = [] }) {
    const clean = cleanExerciseName(name)
    if (clean.length < 3 || clean.length > 80) return 'El nombre debe tener entre 3 y 80 caracteres.'
    if (!LATERALITIES.includes(laterality)) return 'Selecciona la lateralidad.'
    if (equipment.some(item => !(item in EQUIPMENT_LABELS))) return 'Selecciona un material válido.'
    return null
}

/** Ejercicio con el que marcar el nuevo como posible duplicado, si lo hay. */
export function pickPossibleDuplicate(matches) {
    const best = (matches ?? []).reduce(
        (top, match) => (!top || match.score > top.score ? match : top),
        null
    )
    return best && best.score >= POSSIBLE_DUPLICATE_SCORE ? best : null
}
