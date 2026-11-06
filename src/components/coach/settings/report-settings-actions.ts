'use server'

import { getActiveCoachId } from '@/lib/auth/active-coach'
import { reportSections } from '@/lib/studio/report-rules'
import { createClient } from '@/lib/supabase/server'

export interface ReportSettings {
    coachId: string
    whatsappText: string
    emailSubject: string
    emailText: string
    noticeHours: number
    defaultChannel: 'whatsapp' | 'email'
    sections: Record<string, boolean>
}

export async function getReportSettingsAction(): Promise<ReportSettings | null> {
    const coachId = await getActiveCoachId()
    if (!coachId) return null
    const supabase = await createClient()
    const { data } = await supabase
        .from('report_settings')
        .select('whatsapp_text, email_subject, email_text, notice_hours, default_channel, sections')
        .eq('coach_id', coachId)
        .maybeSingle()
    return {
        coachId,
        whatsappText: data?.whatsapp_text ?? '',
        emailSubject: data?.email_subject ?? '',
        emailText: data?.email_text ?? '',
        noticeHours: data?.notice_hours ?? 3,
        defaultChannel: (data?.default_channel as ReportSettings['defaultChannel']) ?? 'whatsapp',
        sections: reportSections(data?.sections),
    }
}

export async function saveReportSettingsAction(settings: ReportSettings): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_save_report_settings', {
        p_coach_id: settings.coachId,
        p_whatsapp_text: settings.whatsappText,
        p_email_subject: settings.emailSubject,
        p_email_text: settings.emailText,
        p_notice_hours: settings.noticeHours,
        p_default_channel: settings.defaultChannel,
        p_sections: settings.sections,
    })
    if (!error) return { success: true }
    const known = error.code === '42501' || error.code === '22023'
    return { success: false, error: known ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.' }
}
