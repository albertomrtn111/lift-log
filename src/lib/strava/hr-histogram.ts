/**
 * Histograma de FC a partir de los streams de Strava: segundos acumulados por
 * pulsación. Es independiente del umbral del atleta, así que las zonas se
 * derivan después con el LTHR vigente (los cambios de umbral re-zonifican
 * todo el histórico sin reprocesar nada).
 */

/** Saltos de reloj mayores que esto se tratan como pausa y no suman tiempo */
const MAX_SAMPLE_GAP_SECONDS = 30

export type HrHistogram = Record<string, number>

export function buildHrHistogram(
    timeData: unknown,
    hrData: unknown
): HrHistogram | null {
    if (!Array.isArray(timeData) || !Array.isArray(hrData)) return null
    const length = Math.min(timeData.length, hrData.length)
    if (length < 2) return null

    const histogram: HrHistogram = {}
    let totalSeconds = 0

    for (let i = 0; i < length - 1; i++) {
        const hr = Number(hrData[i])
        const t0 = Number(timeData[i])
        const t1 = Number(timeData[i + 1])
        if (!Number.isFinite(hr) || hr < 40 || hr > 250) continue
        if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue

        const dt = Math.min(Math.max(t1 - t0, 0), MAX_SAMPLE_GAP_SECONDS)
        if (dt <= 0) continue

        const bucket = String(Math.round(hr))
        histogram[bucket] = (histogram[bucket] ?? 0) + dt
        totalSeconds += dt
    }

    return totalSeconds >= 60 ? histogram : null
}

/** Extrae el histograma desde el JSONB de strava_activity_streams. */
export function buildHrHistogramFromStreamSet(streams: unknown): HrHistogram | null {
    if (!streams || typeof streams !== 'object') return null
    const set = streams as Record<string, { data?: unknown }>
    return buildHrHistogram(set.time?.data, set.heartrate?.data)
}
