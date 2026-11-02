'use server'

import { createClient } from '@/lib/supabase/server'
import { getPendingAnnouncement, saveAnnouncementStatus } from '@/lib/announcements/data'
import type { AnnouncementStatus, AnnouncementView } from '@/lib/announcements/announcements.js'

/** Aviso de novedades pendiente para el atleta que ha iniciado sesión */
export async function getPendingAthleteAnnouncementAction(): Promise<AnnouncementView | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    try {
        return await getPendingAnnouncement(user.id, 'athlete')
    } catch (error) {
        console.warn('[getPendingAthleteAnnouncementAction]', error)
        return null
    }
}

export async function resolveAnnouncementAction(announcementId: string, status: AnnouncementStatus): Promise<{ success: boolean }> {
    if (status !== 'dismissed' && status !== 'completed') return { success: false }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }
    return { success: await saveAnnouncementStatus(user.id, announcementId, status) }
}
