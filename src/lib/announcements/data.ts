import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNOUNCEMENTS } from './catalog.js'
import {
    announcementCandidates,
    pickAnnouncement,
    toAnnouncementView,
    type AnnouncementAudience,
    type AnnouncementContext,
    type AnnouncementStatus,
    type AnnouncementView,
} from './announcements.js'

type DbError = { code?: string; message?: string } | null

/** Sin la migración user_announcements no se enseña ningún aviso (no se podría descartar) */
function isMissingTable(error: DbError) {
    return error?.code === '42P01' || error?.code === 'PGRST205' || /user_announcements/i.test(error?.message ?? '')
}

/** Lo que se sabe del atleta para decidir qué avisos le tocan */
async function getAthleteContext(userId: string): Promise<AnnouncementContext> {
    const supabase = await createClient()
    const admin = createAdminClient()
    const [{ data: profile }, { data: client }] = await Promise.all([
        supabase.from('profiles').select('avatar_url, created_at').eq('id', userId).maybeSingle(),
        admin
            .from('clients')
            .select('id, preferences')
            .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])
    const { data: integration } = client
        ? await admin.from('athlete_integrations').select('status').eq('client_id', client.id).eq('provider', 'strava').maybeSingle()
        : { data: null }

    const preferences = (client?.preferences ?? {}) as { onboarding?: AnnouncementContext['onboarding'] }
    return {
        hasAvatar: Boolean((profile?.avatar_url as string | null)?.trim()),
        stravaConnected: Boolean(integration && !['disconnected', 'revoked', 'error'].includes(integration.status as string)),
        onboarding: preferences.onboarding ?? {},
        accountCreatedAt: (profile?.created_at as string | null) ?? null,
    }
}

/** El aviso que toca enseñar ahora a este usuario, o null */
export async function getPendingAnnouncement(userId: string, audience: AnnouncementAudience): Promise<AnnouncementView | null> {
    const supabase = await createClient()
    const { data: seen, error } = await supabase
        .from('user_announcements')
        .select('announcement_id')
        .eq('user_id', userId)
    if (error) {
        if (!isMissingTable(error)) console.warn('[getPendingAnnouncement]', error.message)
        return null
    }

    const candidates = announcementCandidates(ANNOUNCEMENTS, {
        audience,
        now: new Date(),
        seenIds: (seen ?? []).map(row => row.announcement_id as string),
    })
    if (candidates.length === 0) return null

    const announcement = pickAnnouncement(candidates, await getAthleteContext(userId))
    return announcement ? toAnnouncementView(announcement) : null
}

/** Guarda que el usuario ha descartado o completado un aviso. Completado no se rebaja a descartado. */
export async function saveAnnouncementStatus(userId: string, announcementId: string, status: AnnouncementStatus): Promise<boolean> {
    if (!ANNOUNCEMENTS.some(announcement => announcement.id === announcementId)) return false

    const supabase = await createClient()
    const row = { user_id: userId, announcement_id: announcementId, status, updated_at: new Date().toISOString() }
    const { error } = await supabase
        .from('user_announcements')
        .upsert(row, { onConflict: 'user_id,announcement_id', ignoreDuplicates: status === 'dismissed' })
    if (error) {
        if (!isMissingTable(error)) console.warn('[saveAnnouncementStatus]', error.message)
        return false
    }
    return true
}
