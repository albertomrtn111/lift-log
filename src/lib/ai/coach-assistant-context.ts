import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { buildNextIAAthleteContext } from './nextia-athlete-context'

/**
 * Contexto del asistente global del coach en dos niveles (optimización de coste):
 *
 * 1. SIEMPRE: un roster compacto de todos los atletas activos (nombre, próxima
 *    revisión, última entrega) + tareas y eventos próximos. Son 4-5 consultas
 *    ligeras y unas pocas decenas de tokens por atleta.
 * 2. SOLO SI la pregunta menciona a un atleta por su nombre: el contexto
 *    completo de ese atleta (el mismo que usa NextIA en el workspace), con un
 *    máximo de 2 atletas por pregunta. Así evitamos mandar los datos de todo
 *    el roster en cada mensaje sin pagar la latencia de function-calling.
 */

function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
}

function toDateStr(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

type RosterClient = {
    id: string
    full_name: string
    next_checkin_date: string | null
}

/** Detecta atletas mencionados por nombre en la pregunta (tokens de 3+ letras). */
export function findMentionedClients(
    question: string,
    clients: { id: string; full_name: string }[],
    max = 2
): { id: string; full_name: string }[] {
    const normalizedQuestion = ` ${normalize(question)} `
    const matches: { id: string; full_name: string }[] = []

    for (const client of clients) {
        const fullName = normalize(client.full_name)
        const tokens = fullName.split(/\s+/).filter(t => t.length >= 3)
        const mentioned =
            normalizedQuestion.includes(` ${fullName} `) ||
            tokens.some(token => normalizedQuestion.includes(` ${token} `))

        if (mentioned) {
            matches.push(client)
            if (matches.length >= max) break
        }
    }

    return matches
}

export async function buildCoachAssistantContext(
    coachId: string,
    question: string
): Promise<string> {
    const admin = createAdminClient()
    const today = new Date()
    const todayStr = toDateStr(today)
    const in7 = toDateStr(new Date(today.getTime() + 7 * 86400000))
    const in30 = toDateStr(new Date(today.getTime() + 30 * 86400000))
    const ago14 = toDateStr(new Date(today.getTime() - 14 * 86400000))

    const [clientsRes, schedulesRes, recentCheckinsRes, tasksRes, eventsRes] = await Promise.all([
        admin
            .from('clients')
            .select('id, full_name, next_checkin_date')
            .eq('coach_id', coachId)
            .eq('status', 'active')
            .order('full_name'),
        admin
            .from('client_review_schedules')
            .select('client_id, next_due_date, frequency_days, review_template:review_templates(name)')
            .eq('coach_id', coachId)
            .eq('is_active', true),
        admin
            .from('checkins')
            .select('client_id, submitted_at, status')
            .eq('coach_id', coachId)
            .eq('type', 'checkin')
            .not('submitted_at', 'is', null)
            .gte('submitted_at', `${ago14}T00:00:00`)
            .order('submitted_at', { ascending: false }),
        admin
            .from('coach_tasks')
            .select('task_date, title, priority, client_id')
            .eq('coach_id', coachId)
            .eq('status', 'pending')
            .lte('task_date', in7)
            .order('task_date'),
        admin
            .from('client_events')
            .select('client_id, title, event_date, event_type')
            .eq('coach_id', coachId)
            .eq('status', 'planned')
            .gte('event_date', todayStr)
            .lte('event_date', in30)
            .order('event_date')
            .limit(10),
    ])

    const clients = (clientsRes.data ?? []) as RosterClient[]
    const clientNameById = new Map(clients.map(c => [c.id, c.full_name]))

    type ScheduleRow = {
        client_id: string
        next_due_date: string | null
        frequency_days: number
        review_template: { name: string } | null
    }
    const schedulesByClient = new Map<string, ScheduleRow[]>()
    for (const s of (schedulesRes.data ?? []) as unknown as ScheduleRow[]) {
        const list = schedulesByClient.get(s.client_id) ?? []
        list.push(s)
        schedulesByClient.set(s.client_id, list)
    }

    const lastSubmitByClient = new Map<string, string>()
    for (const c of recentCheckinsRes.data ?? []) {
        if (!lastSubmitByClient.has(c.client_id) && c.submitted_at) {
            lastSubmitByClient.set(c.client_id, c.submitted_at.slice(0, 10))
        }
    }

    const rosterLines = clients.map(client => {
        const schedules = schedulesByClient.get(client.id) ?? []
        const reviews = schedules.length > 0
            ? schedules
                .map(s => `${s.review_template?.name ?? 'Revisión'} cada ${s.frequency_days}d, próxima ${s.next_due_date ?? 'sin fecha'}`)
                .join(' | ')
            : client.next_checkin_date
                ? `Revisión legacy, próxima ${client.next_checkin_date}`
                : 'Sin revisiones asignadas'
        const lastSubmit = lastSubmitByClient.get(client.id)
        return `- ${client.full_name}: ${reviews}${lastSubmit ? ` · última entrega ${lastSubmit}` : ' · sin entregas en 14 días'}`
    })

    const taskLines = (tasksRes.data ?? []).map(t => {
        const who = t.client_id ? clientNameById.get(t.client_id) : null
        return `- ${t.task_date}: ${t.title}${who ? ` (${who})` : ''}${t.priority === 'high' ? ' [prioridad alta]' : ''}`
    })

    const eventLines = (eventsRes.data ?? []).map(e => {
        const who = e.client_id ? clientNameById.get(e.client_id) : null
        return `- ${e.event_date}: ${e.title}${e.event_type ? ` (${e.event_type})` : ''}${who ? ` — ${who}` : ''}`
    })

    const sections: string[] = [
        `## Fecha de hoy\n${todayStr}`,
        `## Atletas activos (${clients.length})\n${rosterLines.join('\n') || 'Sin atletas activos.'}`,
    ]

    if (taskLines.length > 0) {
        sections.push(`## Tareas pendientes del coach (próximos 7 días, incluye vencidas)\n${taskLines.join('\n')}`)
    }
    if (eventLines.length > 0) {
        sections.push(`## Eventos próximos de atletas (30 días)\n${eventLines.join('\n')}`)
    }

    // Nivel 2: detalle completo de los atletas mencionados en la pregunta
    const mentioned = findMentionedClients(question, clients)
    for (const client of mentioned) {
        try {
            const detail = await buildNextIAAthleteContext({
                coachId,
                clientId: client.id,
                recentMessages: [],
            })
            sections.push(`## Detalle completo de ${client.full_name} (mencionado en la pregunta)\n${detail}`)
        } catch (error) {
            console.warn('[coach-assistant] No se pudo cargar el detalle de', client.full_name, error)
        }
    }

    return sections.join('\n\n')
}
