'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'

export type AthleteSex = 'male' | 'female' | 'other'

export interface AthleteBaseline {
    id: string
    coach_id: string
    client_id: string
    birth_date: string | null
    sex: AthleteSex | null
    height_cm: number | null
    reference_weight_kg: number | null
    reference_weight_date: string | null
    vo2max: number | null
    endurance_enabled: boolean
    updated_at: string
}

export interface AthleteBaselineWithCurrent {
    baseline: AthleteBaseline | null
    /** Último peso registrado en client_metrics (para el delta vs referencia) */
    currentWeightKg: number | null
    currentWeightDate: string | null
}

export type AthleteBaselineInput = Pick<AthleteBaseline,
    'birth_date' | 'sex' | 'height_cm' | 'reference_weight_kg' | 'reference_weight_date' | 'vo2max' | 'endurance_enabled'
>

async function assertClientBelongsToCoach(
    supabase: Awaited<ReturnType<typeof requireActiveCoachId>>['supabase'],
    coachId: string,
    clientId: string
) {
    const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) throw new Error('No tienes acceso a este atleta.')
}

export async function getAthleteBaselineAction(
    clientId: string
): Promise<AthleteBaselineWithCurrent> {
    const empty: AthleteBaselineWithCurrent = { baseline: null, currentWeightKg: null, currentWeightDate: null }
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        await assertClientBelongsToCoach(supabase, coachId, clientId)

        const [baselineRes, weightRes] = await Promise.all([
            supabase
                .from('athlete_baseline')
                .select('*')
                .eq('client_id', clientId)
                .maybeSingle(),
            supabase
                .from('client_metrics')
                .select('metric_date, weight_kg')
                .eq('client_id', clientId)
                .not('weight_kg', 'is', null)
                .order('metric_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
        ])

        const currentWeight = weightRes.data?.weight_kg != null ? Number(weightRes.data.weight_kg) : null
        return {
            baseline: (baselineRes.data as AthleteBaseline) ?? null,
            currentWeightKg: Number.isFinite(currentWeight) ? currentWeight : null,
            currentWeightDate: weightRes.data?.metric_date ?? null,
        }
    } catch {
        return empty
    }
}

export async function saveAthleteBaselineAction(
    clientId: string,
    input: AthleteBaselineInput
): Promise<{ success: boolean; baseline?: AthleteBaseline; error?: string }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        await assertClientBelongsToCoach(supabase, coachId, clientId)

        if (input.birth_date) {
            const birth = new Date(`${input.birth_date}T12:00:00`)
            const age = (Date.now() - birth.getTime()) / (365.25 * 86400000)
            if (isNaN(birth.getTime()) || age < 10 || age > 100) {
                return { success: false, error: 'Fecha de nacimiento fuera de rango razonable (10-100 años).' }
            }
        }

        const { data, error } = await supabase
            .from('athlete_baseline')
            .upsert({
                coach_id: coachId,
                client_id: clientId,
                birth_date: input.birth_date,
                sex: input.sex,
                height_cm: input.height_cm,
                reference_weight_kg: input.reference_weight_kg,
                reference_weight_date: input.reference_weight_date,
                vo2max: input.vo2max,
                endurance_enabled: input.endurance_enabled,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'client_id' })
            .select('*')
            .single()

        if (error) {
            return { success: false, error: error.message }
        }

        return { success: true, baseline: data as AthleteBaseline }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudieron guardar los datos del atleta.',
        }
    }
}
