import 'server-only'

import { createClient } from '@/lib/supabase/server'

export interface EvaluationBoardRow {
    client_id: string
    eval_date: string | null
    results: Record<string, number>
    created_at: string
}

/** Todas las evaluaciones del espacio que puedes ver y los clientes activos, para la tabla general. */
export async function getEvaluationBoard(coachId: string) {
    const supabase = await createClient()
    const [{ data: evaluations }, { data: clients }] = await Promise.all([
        supabase.from('client_evaluations').select('client_id, eval_date, results, created_at').eq('coach_id', coachId),
        supabase.from('clients').select('id, full_name').eq('coach_id', coachId).eq('status', 'active').order('full_name'),
    ])
    return {
        evaluations: (evaluations ?? []) as EvaluationBoardRow[],
        clients: (clients ?? []).map(client => ({ id: client.id as string, name: client.full_name as string })),
    }
}
