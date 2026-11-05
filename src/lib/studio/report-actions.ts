'use server'

import { getStudioGrid } from '@/data/studio'
import { getAppUrl } from '@/lib/app-url'
import { getEmailBrand } from '@/lib/branding/get-branding'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { sendSessionReportEmail } from '@/lib/email/mailer'
import { prepareSessions } from '@/lib/studio/grid-rules'
import { buildReport, reportMessage, whatsappUrl } from '@/lib/studio/report-rules'
import { createClient } from '@/lib/supabase/server'

type Result<T = undefined> = { success: true; data: T } | { success: false; error: string }

export interface ReportPanelData {
    clientId: string
    name: string
    phone: string | null
    email: string | null
    consent: boolean
    report: { id: string; code: string; updated_at: string; revoked_at: string | null } | null
    lastDelivery: { channel: string; sent_at: string } | null
    views: number
}

function failure(error: { code?: string; message?: string } | null, fallback: string): { success: false; error: string } {
    return { success: false, error: error?.code === '42501' || error?.code === '22023' ? error.message ?? fallback : fallback }
}

export async function getReportPanelAction(sessionId: string, clientIds: string[]): Promise<Result<ReportPanelData[]>> {
    const supabase = await createClient()
    const [{ data: clients }, { data: reports }] = await Promise.all([
        supabase.from('clients').select('id, full_name, phone, email, report_consent_at').in('id', clientIds),
        supabase
            .from('session_reports')
            .select('id, client_id, code, updated_at, revoked_at, snapshot, report_deliveries(channel, sent_at), report_views(id)')
            .eq('session_id', sessionId)
            .in('client_id', clientIds),
    ])
    return {
        success: true,
        data: (clients ?? []).map(client => {
            const row = (reports ?? []).find(report => report.client_id === client.id)
            const real = row && row.snapshot && Object.keys(row.snapshot as object).length > 0 ? row : null
            const deliveries = (real?.report_deliveries ?? []) as { channel: string; sent_at: string }[]
            return {
                clientId: client.id,
                name: client.full_name,
                phone: client.phone,
                email: client.email,
                consent: client.report_consent_at !== null,
                report: real ? { id: real.id, code: real.code, updated_at: real.updated_at, revoked_at: real.revoked_at } : null,
                lastDelivery: [...deliveries].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0] ?? null,
                views: (real?.report_views ?? []).length,
            }
        }),
    }
}

/** Crea o regenera el informe con los datos de ahora. El enlace sigue siendo el mismo. */
export async function saveReportAction(sessionId: string, clientId: string): Promise<Result<{ code: string }>> {
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No hay un espacio activo.' }
    const data = await getStudioGrid(coachId, clientId)
    const session = data?.sessions.find(entry => entry.id === sessionId)
    if (!data || !session) return { success: false, error: 'Esta persona no está en esa sesión.' }

    const supabase = await createClient()
    const items = data.items.filter(item => item.session_id === sessionId)
    const { data: sets } = items.length > 0
        ? await supabase
            .from('studio_session_sets')
            .select('item_id, client_id, set_index, load_kg, reps, is_detailed')
            .in('item_id', items.map(item => item.id))
            .eq('client_id', clientId)
        : { data: [] }

    const { sessions } = prepareSessions(data.sessions, session.session_date, Number.MAX_SAFE_INTEGER)
    const numbered = sessions.find((entry: { id: string }) => entry.id === sessionId) as { number: number | null } | undefined
    const snapshot = buildReport({
        client: data.client,
        session,
        number: numbered?.number ?? null,
        professional: session.professional_id ? data.professionals[session.professional_id] ?? null : null,
        sections: data.sections.filter(section => section.session_id === sessionId),
        items,
        sets: sets ?? [],
        sessions: data.sessions,
        allItems: data.items,
        clientId,
    })

    const { data: report, error } = await supabase.rpc('studio_save_report', {
        p_session_id: sessionId,
        p_client_id: clientId,
        p_snapshot: snapshot,
    })
    if (error) return failure(error, 'No se ha podido crear el informe.')
    return { success: true, data: { code: report.code } }
}

export async function revokeReportAction(reportId: string): Promise<Result> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_revoke_report', { p_report_id: reportId })
    return error ? failure(error, 'No se ha podido revocar el enlace.') : { success: true, data: undefined }
}

export async function setReportConsentAction(clientId: string, consent: boolean): Promise<Result> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_report_consent', { p_client_id: clientId, p_consent: consent })
    return error ? failure(error, 'No se ha podido guardar el consentimiento.') : { success: true, data: undefined }
}

export async function dismissReportNoticeAction(sessionId: string, clientId: string): Promise<Result> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_dismiss_report_notice', { p_session_id: sessionId, p_client_id: clientId })
    return error ? failure(error, 'No se ha podido descartar el aviso.') : { success: true, data: undefined }
}

/** Devuelve el chat listo para abrir y apunta el envío. Sin consentimiento, se queda en un aviso. */
export async function whatsappReportAction(report: { id: string; code: string }, client: { name: string; phone: string | null }): Promise<Result<{ url: string }>> {
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No hay un espacio activo.' }
    const brand = await getEmailBrand(coachId)
    const url = whatsappUrl(client.phone, reportMessage(client.name, brand?.name ?? 'tu centro', `${getAppUrl()}/informe/${report.code}`))
    if (!url) return { success: false, error: 'Este cliente no tiene un teléfono válido.' }

    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_record_delivery', { p_report_id: report.id, p_channel: 'whatsapp', p_recipient: client.phone })
    if (error) return failure(error, 'No se ha podido preparar el envío.')
    return { success: true, data: { url } }
}

export async function emailReportAction(report: { id: string; code: string }, client: { name: string; email: string | null }): Promise<Result> {
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No hay un espacio activo.' }
    if (!client.email) return { success: false, error: 'Este cliente no tiene email.' }

    const supabase = await createClient()
    // Primero se comprueba el consentimiento: el envío se apunta aunque luego falle el correo.
    const { error } = await supabase.rpc('studio_record_delivery', { p_report_id: report.id, p_channel: 'email', p_recipient: client.email })
    if (error) return failure(error, 'No se ha podido enviar el informe.')

    const sent = await sendSessionReportEmail({ to: client.email, clientName: client.name, url: `${getAppUrl()}/informe/${report.code}`, coachId })
    if (!sent.ok) {
        await supabase.rpc('studio_record_delivery', { p_report_id: report.id, p_channel: 'email', p_recipient: client.email, p_ok: false })
        return { success: false, error: 'No se ha podido enviar el email.' }
    }
    return { success: true, data: undefined }
}
