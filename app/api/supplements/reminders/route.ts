import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient } from '@/lib/push'

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

function getCronSecret() {
    return process.env.SUPPLEMENT_REMINDER_SECRET || process.env.CRON_SECRET || null
}

function isAuthorized(request: NextRequest) {
    const secret = getCronSecret()
    if (!secret) return process.env.NODE_ENV !== 'production'
    const header = request.headers.get('authorization')
    const querySecret = new URL(request.url).searchParams.get('secret')
    return header === `Bearer ${secret}` || querySecret === secret
}

function nowInTimezone(timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date())

    const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}`,
    }
}

function isActiveOnDate(row: SupplementReminderRow, date: string) {
    if (row.start_date && row.start_date > date) return false
    if (row.end_date && row.end_date < date) return false
    return true
}

async function handleReminderRun(request: NextRequest) {
    try {
        if (!isAuthorized(request)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const timezone = process.env.SUPPLEMENT_REMINDER_TIMEZONE || 'Europe/Madrid'
        const { date, time } = nowInTimezone(timezone)
        const supabase = createAdminClient()

        const { data: supplements, error } = await supabase
            .from('client_supplements')
            .select('id, client_id, coach_id, supplement_name, dose_amount, dose_unit, dose_schedule, start_date, end_date')
            .eq('is_active', true)

        if (error) throw error

        const due = ((supplements || []) as SupplementReminderRow[])
            .filter((row) => isActiveOnDate(row, date))
            .filter((row) => Array.isArray(row.dose_schedule) && row.dose_schedule.includes(time))

        let sent = 0
        let skipped = 0

        for (const row of due) {
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

            const { error: deliveryError } = await supabase
                .from('supplement_reminder_deliveries')
                .insert({
                    supplement_id: row.id,
                    client_id: row.client_id,
                    coach_id: row.coach_id,
                    scheduled_date: date,
                    scheduled_time: time,
                })

            if (deliveryError) {
                if (deliveryError.code === '23505') {
                    skipped += 1
                    continue
                }
                throw deliveryError
            }

            await sendPushToClient(row.client_id, {
                title: 'Hora de tu suplementación',
                body: `${row.supplement_name} · ${row.dose_amount} ${row.dose_unit}. Marca la toma cuando puedas.`,
                url: '/diet',
                tag: `supplement-${row.id}-${date}-${time}`,
            })
            sent += 1
        }

        return NextResponse.json({ ok: true, checkedAt: { date, time, timezone }, due: due.length, sent, skipped })
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
