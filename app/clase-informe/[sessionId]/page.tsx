import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReportDocument, type ReportPayload } from '@/components/reports/ReportDocument'
import { getStudioGroupGrid } from '@/data/studio'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { prepareSessions } from '@/lib/studio/grid-rules'
import { peopleLines } from '@/lib/studio/group-rules'
import { buildReport } from '@/lib/studio/report-rules'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Informe de la clase', robots: { index: false, follow: false } }

/** Informe de una clase para el profesional. Va con su sesión, sin enlace público. */
export default async function ClassReportPage({ params, searchParams }: {
    params: Promise<{ sessionId: string }>
    searchParams: Promise<{ solo?: string }>
}) {
    const { sessionId } = await params
    const { solo } = await searchParams
    const coachId = await getActiveCoachId()
    if (!coachId || !/^[0-9a-f-]{36}$/i.test(sessionId)) notFound()

    const supabase = await createClient()
    const [{ data: row }, { data: coach }, { data: branding }] = await Promise.all([
        supabase.from('studio_sessions').select('group_id').eq('id', sessionId).eq('coach_id', coachId).maybeSingle(),
        supabase.from('coaches').select('name').eq('id', coachId).maybeSingle(),
        supabase.from('workspace_branding').select('display_name, logo_light_url, primary_color, report_footer').eq('coach_id', coachId).maybeSingle(),
    ])
    const data = row?.group_id ? await getStudioGroupGrid(coachId, row.group_id) : null
    const session = data?.sessions.find(entry => entry.id === sessionId)
    if (!data?.group || !session) notFound()

    const attended = new Set(data.attendance.filter(entry => entry.session_id === sessionId && entry.status === 'attended').map(entry => entry.client_id))
    const people = data.people.filter(person => attended.has(person.client_id))
    const names = Object.fromEntries(data.group.members.map(member => [member.id, member.name]))
    const { sessions } = prepareSessions(data.sessions, session.session_date, Number.MAX_SAFE_INTEGER)
    const numbered = sessions.find((entry: { id: string }) => entry.id === sessionId) as { number: number | null } | undefined

    const snapshot = buildReport({
        client: data.client,
        session,
        number: numbered?.number ?? null,
        professional: session.professional_id ? data.professionals[session.professional_id] ?? null : null,
        sections: data.sections.filter(section => section.session_id === sessionId),
        items: data.items.filter(item => item.session_id === sessionId),
        sets: [],
        sessions: data.sessions,
        allItems: data.items,
        clientId: '',
        peopleOf: solo ? undefined : (item: { id: string }) => peopleLines(item, people, names),
    })

    const report = {
        snapshot,
        brand: {
            name: branding?.display_name ?? coach?.name ?? null,
            logo: branding?.logo_light_url ?? null,
            color: branding?.primary_color ?? null,
            footer: branding?.report_footer ?? null,
        },
    } as ReportPayload
    return <ReportDocument report={report} />
}
