'use server'

import { createClient } from '@/lib/supabase/server'
import { getMyWorkspaces } from '@/lib/auth/active-coach'

/** Cambia de espacio y lo recuerda para la próxima vez. */
export async function switchWorkspaceAction(coachId: string): Promise<{ success: boolean; error?: string }> {
    const workspaces = await getMyWorkspaces()
    if (!workspaces.some(workspace => workspace.coach_id === coachId)) {
        return { success: false, error: 'No perteneces a ese espacio.' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tu sesión ha caducado.' }

    const { error } = await supabase.from('profiles').update({ last_coach_id: coachId }).eq('id', user.id)
    return error ? { success: false, error: 'No se pudo cambiar de espacio.' } : { success: true }
}
