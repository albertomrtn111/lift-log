'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Hard guard: throws if the client's auth_user_id is NULL.
 * Call at the top of any server action that writes data for a client.
 */
export async function assertClientLinked(clientId: string): Promise<void> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .select('auth_user_id')
        .eq('id', clientId)
        .single()

    if (error || !data) {
        throw new Error(`Client not found (id: ${clientId})`)
    }

    if (!data.auth_user_id) {
        throw new Error(
            'This client has not signed up yet. You cannot create plans, programs, or other data until they complete registration.'
        )
    }
}
