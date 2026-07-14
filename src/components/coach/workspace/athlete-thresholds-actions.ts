'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import {
    validateBounds,
    type CustomZones,
    type HrZoneMethod,
    type ZoneBlockKey,
} from '@/lib/training/zones'

export interface AthleteThresholds {
    id: string
    coach_id: string
    client_id: string
    max_hr: number | null
    resting_hr: number | null
    run_lthr: number | null
    run_threshold_pace_sec: number | null
    bike_lthr: number | null
    bike_ftp_watts: number | null
    hr_zone_method: HrZoneMethod
    custom_zones: CustomZones | null
    tested_at: string | null
    notes: string | null
    updated_at: string
}

export type AthleteThresholdsInput = Pick<AthleteThresholds,
    'max_hr' | 'resting_hr' | 'run_lthr' | 'run_threshold_pace_sec' | 'bike_lthr' | 'bike_ftp_watts' | 'hr_zone_method' | 'custom_zones' | 'tested_at' | 'notes'
>

const VALID_METHODS: HrZoneMethod[] = ['friel_lthr', 'coggan_lthr', 'pct_max', 'hrr']
const ZONE_BLOCK_KEYS: ZoneBlockKey[] = ['run_hr', 'bike_hr', 'run_pace', 'bike_power']

function sanitizeCustomZones(input: CustomZones | null): { zones: CustomZones | null; error?: string } {
    if (!input) return { zones: null }

    const zones: CustomZones = {}
    for (const key of ZONE_BLOCK_KEYS) {
        const bounds = input[key]
        if (!bounds) continue
        const numeric = bounds.map(Number)
        const error = validateBounds(key, numeric)
        if (error) return { zones: null, error: `Intervalos de ${key}: ${error}` }
        zones[key] = numeric
    }
    return { zones: Object.keys(zones).length > 0 ? zones : null }
}

async function assertClientBelongsToCoach(supabase: Awaited<ReturnType<typeof requireActiveCoachId>>['supabase'], coachId: string, clientId: string) {
    const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) throw new Error('No tienes acceso a este atleta.')
}

export async function getAthleteThresholdsAction(
    clientId: string
): Promise<AthleteThresholds | null> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        await assertClientBelongsToCoach(supabase, coachId, clientId)

        const { data, error } = await supabase
            .from('athlete_thresholds')
            .select('*')
            .eq('client_id', clientId)
            .maybeSingle()

        if (error) {
            console.error('[athlete-thresholds] load:', error)
            return null
        }
        return (data as AthleteThresholds) ?? null
    } catch {
        return null
    }
}

export async function saveAthleteThresholdsAction(
    clientId: string,
    input: AthleteThresholdsInput
): Promise<{ success: boolean; thresholds?: AthleteThresholds; error?: string }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        await assertClientBelongsToCoach(supabase, coachId, clientId)

        // Validaciones de coherencia (los rangos absolutos los valida la BD)
        if (input.max_hr && input.resting_hr && input.resting_hr >= input.max_hr) {
            return { success: false, error: 'La FC en reposo debe ser menor que la FC máxima.' }
        }
        if (input.max_hr && input.run_lthr && input.run_lthr > input.max_hr) {
            return { success: false, error: 'El LTHR de carrera no puede superar la FC máxima.' }
        }
        if (input.max_hr && input.bike_lthr && input.bike_lthr > input.max_hr) {
            return { success: false, error: 'El LTHR de ciclismo no puede superar la FC máxima.' }
        }
        if (!VALID_METHODS.includes(input.hr_zone_method)) {
            return { success: false, error: 'Método de zonas no válido.' }
        }

        const { zones: customZones, error: zonesError } = sanitizeCustomZones(input.custom_zones)
        if (zonesError) {
            return { success: false, error: zonesError }
        }

        const { data, error } = await supabase
            .from('athlete_thresholds')
            .upsert({
                coach_id: coachId,
                client_id: clientId,
                max_hr: input.max_hr,
                resting_hr: input.resting_hr,
                run_lthr: input.run_lthr,
                run_threshold_pace_sec: input.run_threshold_pace_sec,
                bike_lthr: input.bike_lthr,
                bike_ftp_watts: input.bike_ftp_watts,
                hr_zone_method: input.hr_zone_method,
                custom_zones: customZones,
                tested_at: input.tested_at,
                notes: input.notes,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'client_id' })
            .select('*')
            .single()

        if (error) {
            return { success: false, error: error.message }
        }

        revalidatePath('/coach/clients')
        return { success: true, thresholds: data as AthleteThresholds }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudieron guardar los umbrales.',
        }
    }
}
