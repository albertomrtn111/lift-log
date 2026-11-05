import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Espacio con el que trabaja quien ha entrado, una vez por petición. Null si no tiene equipo. */
export const getActiveCoachId = cache(async (): Promise<string | null> => {
    const supabase = await createClient()
    const { data } = await supabase.rpc('active_coach_id')
    return (data as string | null) ?? null
})

export interface Workspace {
    coach_id: string
    name: string
    role: string
    is_active: boolean
}

/** Espacios de quien ha entrado, para el selector. */
export const getMyWorkspaces = cache(async (): Promise<Workspace[]> => {
    const supabase = await createClient()
    const { data } = await supabase.rpc('my_workspaces')
    return (data as Workspace[] | null) ?? []
})
