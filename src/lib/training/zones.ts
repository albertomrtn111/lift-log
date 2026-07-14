/**
 * Zonas de entrenamiento a partir de umbrales.
 *
 * Arquitectura: todo se expresa como LÍMITES numéricos entre zonas (bounds).
 * - FC y potencia: límites ascendentes. Ritmo: descendentes (menos seg/km = más rápido).
 * - Los métodos estándar (Friel, Coggan, %FCmáx, Karvonen) calculan los límites
 *   desde el umbral; el coach puede sobreescribirlos por bloque (custom_zones).
 * - La clasificación (badges, histogramas) usa siempre los límites efectivos,
 *   así los overrides del coach afectan a todo el sistema.
 */

export interface TrainingZone {
    zone: number
    name: string
    /** Etiqueta legible del rango (ej. "142–151 ppm" o "5:10–5:45 /km") */
    range: string
    /** Color tailwind-friendly para pintar la barra */
    color: string
}

export const ZONE_COLORS = [
    'bg-sky-400',
    'bg-emerald-400',
    'bg-yellow-400',
    'bg-orange-500',
    'bg-red-500',
    'bg-red-700',
]

export const HR_ZONE_NAMES = ['Recuperación', 'Aeróbico', 'Tempo', 'Umbral', 'VO2máx']
export const POWER_ZONE_NAMES = ['Recuperación', 'Resistencia', 'Tempo', 'Umbral', 'VO2máx', 'Anaeróbico']

// ---------------------------------------------------------------------------
// Métodos de cálculo de zonas de FC
// ---------------------------------------------------------------------------

export type HrZoneMethod = 'friel_lthr' | 'coggan_lthr' | 'pct_max' | 'hrr'

export const HR_ZONE_METHODS: {
    value: HrZoneMethod
    label: string
    description: string
    requires: string
}[] = [
    {
        value: 'friel_lthr',
        label: 'Umbral LTHR · Joe Friel',
        description: 'Zonas como % del umbral de lactato. El estándar en resistencia.',
        requires: 'Test de 30 min: FC media de los últimos 20 min = LTHR.',
    },
    {
        value: 'coggan_lthr',
        label: 'Umbral LTHR · Coggan',
        description: 'Variante de Coggan sobre el LTHR, habitual en ciclismo.',
        requires: 'Mismo test de umbral (LTHR por deporte).',
    },
    {
        value: 'pct_max',
        label: '% FC máxima',
        description: 'Zonas clásicas 50-100% de la FC máxima. Menos preciso, útil sin test de umbral.',
        requires: 'Solo FC máxima (test de campo o la mayor vista en competición).',
    },
    {
        value: 'hrr',
        label: 'Reserva cardíaca · Karvonen',
        description: 'Usa el rango entre reposo y máxima. Se adapta mejor al nivel del atleta que el %FCmáx.',
        requires: 'FC máxima y FC en reposo (medida al despertar).',
    },
]

export interface HrThresholdInputs {
    lthr?: number | null
    maxHr?: number | null
    restingHr?: number | null
}

/**
 * Límites de FC entre zonas: [inicio Z2, inicio Z3, inicio Z4, inicio Z5].
 * null si faltan los datos que requiere el método.
 */
export function computeHrBounds(method: HrZoneMethod, inputs: HrThresholdInputs): number[] | null {
    const { lthr, maxHr, restingHr } = inputs

    switch (method) {
        case 'friel_lthr':
            if (!lthr) return null
            return [0.85, 0.90, 0.95, 1.0].map(p => Math.round(lthr * p))
        case 'coggan_lthr':
            if (!lthr) return null
            return [0.69, 0.84, 0.95, 1.06].map(p => Math.round(lthr * p))
        case 'pct_max':
            if (!maxHr) return null
            return [0.60, 0.70, 0.80, 0.90].map(p => Math.round(maxHr * p))
        case 'hrr':
            if (!maxHr || !restingHr) return null
            return [0.60, 0.70, 0.80, 0.90].map(p => Math.round(restingHr + (maxHr - restingHr) * p))
    }
}

/** Límites de ritmo (seg/km, DESCENDENTES) según % del umbral (Friel). */
export function computePaceBounds(thresholdSecPerKm: number): number[] {
    // Z1 más lento que b1 · Z2 (b2,b1] · Z3 (b3,b2] · Z4 (b4,b3] · Z5 más rápido que b4
    return [1.29, 1.14, 1.06, 0.99].map(p => Math.round(thresholdSecPerKm * p))
}

/** Límites de potencia (W, ascendentes, 6 zonas Coggan). */
export function computePowerBounds(ftp: number): number[] {
    return [0.56, 0.76, 0.91, 1.06, 1.21].map(p => Math.round(ftp * p))
}

// ---------------------------------------------------------------------------
// Zonas legibles desde límites
// ---------------------------------------------------------------------------

export function formatPace(secondsPerKm: number): string {
    const mins = Math.floor(secondsPerKm / 60)
    const secs = Math.round(secondsPerKm % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function parsePaceToSeconds(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/)
    if (!match) return null
    const seconds = Number(match[1]) * 60 + Number(match[2])
    return seconds >= 120 && seconds <= 900 ? seconds : null
}

export function hrZonesFromBounds(bounds: number[]): TrainingZone[] {
    return HR_ZONE_NAMES.map((name, i) => ({
        zone: i + 1,
        name,
        range: i === 0
            ? `< ${bounds[0]} ppm`
            : i === HR_ZONE_NAMES.length - 1
                ? `≥ ${bounds[3]} ppm`
                : `${bounds[i - 1]}–${bounds[i] - 1} ppm`,
        color: ZONE_COLORS[i],
    }))
}

export function paceZonesFromBounds(bounds: number[]): TrainingZone[] {
    return HR_ZONE_NAMES.map((name, i) => ({
        zone: i + 1,
        name,
        range: i === 0
            ? `> ${formatPace(bounds[0])} /km`
            : i === HR_ZONE_NAMES.length - 1
                ? `< ${formatPace(bounds[3])} /km`
                : `${formatPace(bounds[i - 1])}–${formatPace(bounds[i])} /km`,
        color: ZONE_COLORS[i],
    }))
}

export function powerZonesFromBounds(bounds: number[]): TrainingZone[] {
    return POWER_ZONE_NAMES.map((name, i) => ({
        zone: i + 1,
        name,
        range: i === 0
            ? `< ${bounds[0]} W`
            : i === POWER_ZONE_NAMES.length - 1
                ? `≥ ${bounds[4]} W`
                : `${bounds[i - 1]}–${bounds[i] - 1} W`,
        color: ZONE_COLORS[i],
    }))
}

// ---------------------------------------------------------------------------
// Overrides manuales del coach
// ---------------------------------------------------------------------------

export type ZoneBlockKey = 'run_hr' | 'bike_hr' | 'run_pace' | 'bike_power'

export interface CustomZones {
    run_hr?: number[]
    bike_hr?: number[]
    run_pace?: number[]
    bike_power?: number[]
}

/** Valida un array de límites para un bloque. Devuelve mensaje de error o null. */
export function validateBounds(block: ZoneBlockKey, bounds: number[]): string | null {
    const expectedLength = block === 'bike_power' ? 5 : 4
    if (bounds.length !== expectedLength || bounds.some(b => !Number.isFinite(b))) {
        return `Se esperan ${expectedLength} límites numéricos.`
    }

    if (block === 'run_pace') {
        for (let i = 1; i < bounds.length; i++) {
            if (bounds[i] >= bounds[i - 1]) return 'Los ritmos deben ir de más lento a más rápido.'
        }
        if (bounds[0] > 900 || bounds[bounds.length - 1] < 120) return 'Ritmos fuera de rango (2:00–15:00 /km).'
        return null
    }

    for (let i = 1; i < bounds.length; i++) {
        if (bounds[i] <= bounds[i - 1]) return 'Los límites deben ser estrictamente crecientes.'
    }
    if (block === 'bike_power') {
        if (bounds[0] < 30 || bounds[bounds.length - 1] > 1500) return 'Potencias fuera de rango (30–1500 W).'
    } else {
        if (bounds[0] < 60 || bounds[bounds.length - 1] > 230) return 'Pulsaciones fuera de rango (60–230 ppm).'
    }
    return null
}

export interface ResolvedZoneBounds {
    bounds: number[]
    /** 'custom' si el coach editó los intervalos a mano */
    source: 'method' | 'custom'
}

/** Límites efectivos de FC para un deporte: override del coach > método. */
export function resolveHrBounds(params: {
    sport: 'run' | 'bike'
    method: HrZoneMethod
    lthr?: number | null
    maxHr?: number | null
    restingHr?: number | null
    custom?: CustomZones | null
}): ResolvedZoneBounds | null {
    const key: ZoneBlockKey = params.sport === 'run' ? 'run_hr' : 'bike_hr'
    const custom = params.custom?.[key]
    if (custom && validateBounds(key, custom) === null) {
        return { bounds: custom, source: 'custom' }
    }
    const bounds = computeHrBounds(params.method, params)
    return bounds ? { bounds, source: 'method' } : null
}

/** Límites efectivos de ritmo de carrera. */
export function resolvePaceBounds(params: {
    thresholdPaceSec?: number | null
    custom?: CustomZones | null
}): ResolvedZoneBounds | null {
    const custom = params.custom?.run_pace
    if (custom && validateBounds('run_pace', custom) === null) {
        return { bounds: custom, source: 'custom' }
    }
    if (!params.thresholdPaceSec) return null
    return { bounds: computePaceBounds(params.thresholdPaceSec), source: 'method' }
}

/** Límites efectivos de potencia. */
export function resolvePowerBounds(params: {
    ftp?: number | null
    custom?: CustomZones | null
}): ResolvedZoneBounds | null {
    const custom = params.custom?.bike_power
    if (custom && validateBounds('bike_power', custom) === null) {
        return { bounds: custom, source: 'custom' }
    }
    if (!params.ftp) return null
    return { bounds: computePowerBounds(params.ftp), source: 'method' }
}

// ---------------------------------------------------------------------------
// Clasificación de una actividad en su zona (por límites efectivos)
// ---------------------------------------------------------------------------

/** Clases de badge por zona (fondo suave + texto), compatibles con dark mode */
export const ZONE_BADGE_CLASSES: Record<number, string> = {
    1: 'bg-sky-500/10 text-sky-600 border-sky-500/25 dark:text-sky-400',
    2: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-400',
    3: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/25 dark:text-yellow-400',
    4: 'bg-orange-500/10 text-orange-600 border-orange-500/25 dark:text-orange-400',
    5: 'bg-red-500/10 text-red-600 border-red-500/25 dark:text-red-400',
    6: 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300',
}

export interface ZoneDescription {
    zone: number
    name: string
    /** Etiqueta corta: "Z2 · Aeróbico" */
    label: string
    badgeClass: string
}

/** Zona (1-5) de una FC según los límites efectivos. */
export function hrValueToZone(bounds: number[], hr: number): number {
    if (hr < bounds[0]) return 1
    if (hr < bounds[1]) return 2
    if (hr < bounds[2]) return 3
    if (hr < bounds[3]) return 4
    return 5
}

/** Clasifica una FC media en su zona según los límites efectivos. */
export function describeHrZone(bounds: number[] | null | undefined, avgHr: number): ZoneDescription | null {
    if (!bounds || bounds.length !== 4 || !avgHr || avgHr < 40 || avgHr > 250) return null
    const zone = hrValueToZone(bounds, avgHr)
    return {
        zone,
        name: HR_ZONE_NAMES[zone - 1],
        label: `Z${zone} · ${HR_ZONE_NAMES[zone - 1]}`,
        badgeClass: ZONE_BADGE_CLASSES[zone],
    }
}

export interface ZoneTimeDistribution {
    /** Segundos en cada zona, índice 0 = Z1 */
    secondsByZone: [number, number, number, number, number]
    totalSeconds: number
}

/**
 * Convierte un histograma de FC (segundos por pulsación) en tiempo por zona
 * usando los límites efectivos. Como el histograma es independiente del
 * umbral, cambiar método/umbral/intervalos re-zonifica todo sin reprocesar.
 */
export function zonesFromHistogram(
    histogram: Record<string, number> | null | undefined,
    bounds: number[] | null | undefined
): ZoneTimeDistribution | null {
    if (!histogram || !bounds || bounds.length !== 4) return null

    const secondsByZone: [number, number, number, number, number] = [0, 0, 0, 0, 0]
    let totalSeconds = 0

    for (const [hrKey, seconds] of Object.entries(histogram)) {
        const hr = Number(hrKey)
        const secs = Number(seconds)
        if (!Number.isFinite(hr) || !Number.isFinite(secs) || secs <= 0) continue
        secondsByZone[hrValueToZone(bounds, hr) - 1] += secs
        totalSeconds += secs
    }

    return totalSeconds > 0 ? { secondsByZone, totalSeconds } : null
}

/** Días desde el último test; null si nunca se testó. */
export function daysSinceTested(testedAt: string | null): number | null {
    if (!testedAt) return null
    const tested = new Date(`${testedAt}T12:00:00`)
    if (isNaN(tested.getTime())) return null
    return Math.floor((Date.now() - tested.getTime()) / 86400000)
}

/** Recomendación estándar: re-test cada 4-6 semanas. */
export const RETEST_RECOMMENDED_DAYS = 42
