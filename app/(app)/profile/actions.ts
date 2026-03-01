'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfileNameAction(
    newName: string
): Promise<{ success: boolean; error?: string }> {
    if (!newName || newName.trim().length === 0) {
        return { success: false, error: 'El nombre no puede estar vacío' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: newName.trim(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

    if (error) {
        console.error('[updateProfileName] Error:', error.message)
        return { success: false, error: error.message }
    }

    revalidatePath('/profile')
    revalidatePath('/profile/settings')
    return { success: true }
}
