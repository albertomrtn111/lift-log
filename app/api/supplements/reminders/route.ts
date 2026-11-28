import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages } from '@/lib/supabase/fetch-all-pages'
import { sendSupplementReminderNotification } from '@/lib/notifications/client'
import { dateTimeInTimezone, getReminderTargets } from '@/lib/supplements/reminder-time'
import { isValidTimezone } from '@/lib/notifications/quiet-hours'

export const dynamic = 'force-dynamic'

type SupplementReminderRow = {
    id: string
    client_id: string
    coach_id: string
    supplement_name: string
    dose_amount: number
    dose_unit: string
    dose_schedule: string[] | null
    start_date: string | null
    end_date: string | null
}

type ReminderTarget = {
    date: string
    time: string
}

type DueReminder = {
    supplement: SupplementReminderRow
    target: ReminderTarget
}

function getCronSecret() {
    return process.env.SUPPLEMENT_REMINDER_SECRET || process.env.CRON_SECRET || null
}

function isAuthorized(request: NextRequest) {
    const secret = getCronSecret()
    // SECURITY: fail closed — without a configured secret nobody is authorized,
    // and the secret is only accepted via Authorization header (never query param,
    // to avoid leaking it in logs/proxies).
    if (!secret) return false
    const header = request.headers.get('authorization')
    return header === `Bearer ${secret}`
}

function nowInTimezone(timezone: string) {
    return dateTimeInTimezone(new Date(), timezone)
}

const MAX_LOOKBACK_MINUTES = 60

function getRequestReminderTargets(request: NextRequest, timezone: string): ReminderTarget[] {
    const params = new URL(request.url).searchParams
    // El worker pasa cuánto mirar hacia atrás (va cada media hora, con margen); a mano, la variable o 5.
    const lookbackMinutes = Math.min(
        MAX_LOOKBACK_MINUTES,
        Math.max(1, Number(params.get('lookback') || process.env.SUPPLEMENT_REMINDER_LOOKBACK_MINUTES || 5) || 5)
    )

    return getReminderTargets({
        timezone,
        requestedDate: params.get('date'),
        requestedTime: params.get('time'),
        lookbackMinutes,
    })
}

function isActiveOnDate(row: SupplementReminderRow, date: string) {
    if (row.start_date && row.start_date > date) return false
    if (row.end_date && row.end_date < date) return false
    return true
}

function formatDose(row: SupplementReminderRow) {
    return `${row.supplement_name} · ${row.dose_amount} ${row.dose_unit}`
}

function buildReminderCopy(rows: SupplementReminderRow[]) {
    if (rows.length === 1) {
        return `${formatDose(rows[0])}. Marca la toma cuando puedas.`
    }

    const names = rows.slice(0, 3).map((row) => row.supplement_name).join(', ')
    const suffix = rows.length > 3 ? ` y ${rows.length - 3} más` : ''
    return `Tienes ${rows.length} suplementos pendientes: ${names}${suffix}.`
}

async function handleReminderRun(request: NextRequest) {
    try {
        if (!isAuthorized(request)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const timezone = process.env.SUPPLEMENT_REMINDER_TIMEZONE || 'Europe/Madrid'
        const checkedAt = nowInTimezone(timezone)
        const targets = getRequestReminderTargets(request, timezone)
        if (targets.length === 0) {
            return NextResponse.json({ error: 'Fecha u hora inválida' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Una sola consulta: suplementos activos de atletas activos, con la zona horaria de cada uno.
        // Los atletas dados de baja no reciben recordatorios aunque sus suplementos sigan activos.
        // Por páginas: Supabase corta en 1.000 filas y los que quedaran fuera no recibirían nada (NXT-153).
        const { data: supplements, error } = await fetchAllPages((from, to) =>
            supabase
                .from('client_supplements')
                .select('id, client_id, coach_id, supplement_name, dose_amount, dose_unit, dose_schedule, start_date, end_date, clients!inner(status, client_notification_preferences(timezone))')
                .eq('is_active', true)
                .eq('clients.status', 'active')
                .order('id', { ascending: true })
                .range(from, to)
        )

        if (error) throw error

        const supplementRows = (supplements || []) as Array<SupplementReminderRow & { clients?: unknown }>
        const activeClientIds = new Set(supplementRows.map((row) => row.client_id))

        // Cada atleta recibe sus tomas en su hora local (la del móvil); sin ella, la del servidor.
        const timezoneByClient = new Map<string, string>()
        for (const row of supplementRows) {
            const client = (Array.isArray(row.clients) ? row.clients[0] : row.clients) as
                { client_notification_preferences?: { timezone?: string | null } | Array<{ timezone?: string | null }> | null } | undefined
            const prefs = client?.client_notification_preferences
            const tz = (Array.isArray(prefs) ? prefs[0] : prefs)?.timezone ?? null
            if (tz && isValidTimezone(tz)) timezoneByClient.set(row.client_id, tz)
        }
        const params = new URL(request.url).searchParams
        const manualRun = Boolean(params.get('date') && params.get('time'))
        const targetsByTimezone = new Map<string, ReminderTarget[]>([[timezone, targets]])
        const targetsFor = (clientId: string) => {
            const tz = manualRun ? timezone : (timezoneByClient.get(clientId) ?? timezone)
            let cached = targetsByTimezone.get(tz)
            if (!cached) {
                cached = getRequestReminderTargets(request, tz)
                targetsByTimezone.set(tz, cached)
            }
            return cached
        }

        const due: DueReminder[] = []
        for (const row of supplementRows) {
            if (!activeClientIds.has(row.client_id)) continue

            const schedule = Array.isArray(row.dose_schedule)
                ? row.dose_schedule.filter((time): time is string => /^\d{2}:\d{2}$/.test(time))
                : []

            for (const target of targetsFor(row.client_id)) {
                if (isActiveOnDate(row, target.date) && schedule.includes(target.time)) {
                    due.push({ supplement: row, target })
                }
            }
        }

        let sentNotifications = 0
        let failedNotifications = 0
        let queuedDoses = 0
        let skipped = 0
        const grouped = new Map<string, {
            clientId: string
            date: string
            time: string
            rows: SupplementReminderRow[]
            deliveryIds: string[]
        }>()

        for (const item of due) {
            const row = item.supplement
            const { date, time } = item.target
            const { data: alreadyLogged, error: logError } = await supabase
                .from('supplement_dose_logs')
                .select('id')
                .eq('supplement_id', row.id)
                .eq('scheduled_date', date)
                .eq('scheduled_time', time)
                .maybeSingle()

            if (logError) throw logError
            if (alreadyLogged) {
                skipped += 1
                continue
            }

            const { data: delivery, error: deliveryError } = await supabase
                .from('supplement_reminder_deliveries')
                .insert({
                    supplement_id: row.id,
                    client_id: row.client_id,
                    coach_id: row.coach_id,
                    scheduled_date: date,
                    scheduled_time: time,
                })
                .select('id')
                .single()

            if (deliveryError) {
                if (deliveryError.code === '23505') {
                    skipped += 1
                    continue
                }
                throw deliveryError
            }

            const groupKey = `${row.client_id}|${date}|${time}`
            const group = grouped.get(groupKey) ?? {
                clientId: row.client_id,
                date,
                time,
                rows: [],
                deliveryIds: [],
            }
            group.rows.push(row)
            group.deliveryIds.push(delivery.id)
            grouped.set(groupKey, group)
            queuedDoses += 1
        }

        for (const group of grouped.values()) {
            const title = 'Hora de tu suplementación'
            const body = buildReminderCopy(group.rows)
            const url = `/diet?tab=supplements&date=${group.date}`
            const tag = `supplement-${group.clientId}-${group.date}-${group.time}`

            const result = await sendSupplementReminderNotification(group.clientId, {
                title,
                body,
                url,
                tag,
            }, { date: group.date, time: group.time })

            if (result.status === 'failed') {
                // No llegó por ningún canal: liberamos la marca de entrega para que la
                // siguiente pasada (dentro de la ventana de lookback) lo reintente.
                const { error: releaseError } = await supabase
                    .from('supplement_reminder_deliveries')
                    .delete()
                    .in('id', group.deliveryIds)
                if (releaseError) {
                    console.error('[supplements/reminders] No se pudo liberar la entrega para reintentar:', releaseError)
                }
                failedNotifications += 1
                continue
            }

            if (result.status === 'sent') sentNotifications += 1
            else skipped += group.rows.length
        }

        return NextResponse.json({
            ok: true,
            checkedAt: { ...checkedAt, timezone },
            targets,
            due: due.length,
            queuedDoses,
            sentNotifications,
            failedNotifications,
            skipped,
        })
    } catch (error) {
        console.error('[supplements/reminders]', error)
        return NextResponse.json({ error: 'No se pudieron procesar recordatorios' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    return handleReminderRun(request)
}

export async function GET(request: NextRequest) {
    return handleReminderRun(request)
}
