'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserContext } from '@/lib/auth/get-user-context'
import {
    DEFAULT_CLIENT_NOTIFICATION_PREFERENCES,
    isMissingPreferencesTable,
    type ClientNotificationPreferences,
} from '@/lib/notifications/preferences'
import {
    readNotificationPreferencesFromClientPreferences,
    sanitizeNotificationPreferences,
    writeNotificationPreferencesToClientPreferences,
} from '@/lib/notifications/preference-values'
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

export async function updateAvatarUrlAction(
    avatarUrl: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

    if (error) {
        console.error('[updateAvatarUrl] Error:', error.message)
        return { success: false, error: error.message }
    }

    revalidatePath('/profile')
    return { success: true }
}

async function getCurrentClientId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'No autenticado' as const }
    }

    const context = await getUserContext(user.id)
    if (!context.isClient || !context.clientId) {
        return { error: 'No se encontró el perfil de cliente' as const }
    }

    return { clientId: context.clientId }
}

function sanitizePreferences(input: Partial<ClientNotificationPreferences>): ClientNotificationPreferences {
    return sanitizeNotificationPreferences(input) as ClientNotificationPreferences
}

async function getFallbackNotificationPreferences(
    clientId: string
): Promise<{ success: boolean; preferences?: ClientNotificationPreferences; error?: string }> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('clients')
        .select('preferences')
        .eq('id', clientId)
        .maybeSingle()

    if (error) {
        console.error('[getFallbackNotificationPreferences] Error:', error.message)
        return { success: false, error: error.message }
    }

    return {
        success: true,
        preferences: readNotificationPreferencesFromClientPreferences(data?.preferences) as ClientNotificationPreferences,
    }
}

async function updateFallbackNotificationPreferences(
    clientId: string,
    preferences: ClientNotificationPreferences
): Promise<{ success: boolean; preferences?: ClientNotificationPreferences; error?: string }> {
    const admin = createAdminClient()
    const { data: clientRow, error: readError } = await admin
        .from('clients')
        .select('preferences')
        .eq('id', clientId)
        .maybeSingle()

    if (readError) {
        console.error('[updateFallbackNotificationPreferences] Read error:', readError.message)
        return { success: false, error: readError.message }
    }

    const nextClientPreferences = writeNotificationPreferencesToClientPreferences(
        clientRow?.preferences,
        preferences
    )

    const { error: updateError } = await admin
        .from('clients')
        .update({
            preferences: nextClientPreferences,
            updated_at: new Date().toISOString(),
        })
        .eq('id', clientId)

    if (updateError) {
        console.error('[updateFallbackNotificationPreferences] Update error:', updateError.message)
        return { success: false, error: updateError.message }
    }

    revalidatePath('/profile')
    return { success: true, preferences }
}

export async function getNotificationPreferencesAction(): Promise<{
    success: boolean
    preferences?: ClientNotificationPreferences
    error?: string
}> {
    const context = await getCurrentClientId()
    if ('error' in context) {
        return { success: false, error: context.error }
    }

    const admin = createAdminClient()
    const { data, error } = await admin
        .from('client_notification_preferences')
        .select('messages_enabled, reviews_enabled, supplements_enabled')
        .eq('client_id', context.clientId)
        .maybeSingle()

    if (error) {
        if (isMissingPreferencesTable(error)) {
            return getFallbackNotificationPreferences(context.clientId)
        }
        console.error('[getNotificationPreferencesAction] Error:', error.message)
        return { success: false, error: error.message }
    }

    if (data) {
        return { success: true, preferences: sanitizePreferences(data) }
    }

    const { data: created, error: createError } = await admin
        .from('client_notification_preferences')
        .insert({
            client_id: context.clientId,
            ...DEFAULT_CLIENT_NOTIFICATION_PREFERENCES,
        })
        .select('messages_enabled, reviews_enabled, supplements_enabled')
        .single()

    if (createError) {
        if (isMissingPreferencesTable(createError)) {
            return updateFallbackNotificationPreferences(
                context.clientId,
                DEFAULT_CLIENT_NOTIFICATION_PREFERENCES as ClientNotificationPreferences
            )
        }
        console.error('[getNotificationPreferencesAction] Insert error:', createError.message)
        return { success: false, error: createError.message }
    }

    return { success: true, preferences: sanitizePreferences(created) }
}

export async function updateNotificationPreferencesAction(
    preferences: Partial<ClientNotificationPreferences>
): Promise<{
    success: boolean
    preferences?: ClientNotificationPreferences
    error?: string
}> {
    const context = await getCurrentClientId()
    if ('error' in context) {
        return { success: false, error: context.error }
    }

    const sanitized = sanitizePreferences(preferences)
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('client_notification_preferences')
        .upsert({
            client_id: context.clientId,
            ...sanitized,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id' })
        .select('messages_enabled, reviews_enabled, supplements_enabled')
        .single()

    if (error) {
        if (isMissingPreferencesTable(error)) {
            return updateFallbackNotificationPreferences(context.clientId, sanitized)
        }
        console.error('[updateNotificationPreferencesAction] Error:', error.message)
        return { success: false, error: error.message }
    }

    revalidatePath('/profile')
    return { success: true, preferences: sanitizePreferences(data) }
}
