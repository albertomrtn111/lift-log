import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePayloadLines } from '@/lib/ai/checkin-payload-lines'
import type { FormField } from '@/types/forms'

const MAX_ANSWER_CHARS = 600
const MAX_TOTAL_CHARS = 5000

/**
 * Respuestas del formulario de onboarding del atleta (el último enviado),
 * listas para el prompt de la IA. Vacío si aún no lo ha rellenado.
 */
export async function getOnboardingAnswersContext(coachId: string, clientId: string): Promise<string> {
    const admin = createAdminClient()
    const { data: checkins } = await admin
        .from('checkins')
        .select('raw_payload, form_template_id, status, submitted_at')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .eq('type', 'onboarding')
        .neq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(5)

    const submitted = (checkins ?? []).find(checkin =>
        checkin.raw_payload && typeof checkin.raw_payload === 'object' && Object.keys(checkin.raw_payload).length > 0
    )
    if (!submitted) return ''

    let fields: FormField[] = []
    if (submitted.form_template_id) {
        const { data: template } = await admin
            .from('form_templates')
            .select('schema')
            .eq('id', submitted.form_template_id)
            .maybeSingle()
        fields = Array.isArray(template?.schema) ? template.schema as FormField[] : []
    }

    const lines = (resolvePayloadLines(submitted.raw_payload, [], fields) as string[])
        .filter(line => line !== 'Sin datos')
        .map(line => line.length > MAX_ANSWER_CHARS ? `${line.slice(0, MAX_ANSWER_CHARS)}…` : line)
    if (lines.length === 0) return ''

    let text = 'Respuestas del atleta en su formulario de onboarding:\n'
    for (const line of lines) {
        if (text.length + line.length > MAX_TOTAL_CHARS) break
        text += `${line}\n`
    }
    return text.trim()
}
