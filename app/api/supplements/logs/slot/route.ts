import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserContext } from '@/lib/auth/get-user-context'
import { clearSupplementReminderIfDone, dueSupplementSlots } from '@/lib/supplements/reminder-clear'

export const dynamic = 'force-dynamic'

/**
 * Botón «Hecho» del recordatorio de suplementación (lo llama el service
 * worker): marca como tomadas todas las tomas de esa hora que falten.
 * Body: { date: 'YYYY-MM-DD', time: 'HH:MM' }.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const context = await getUserContext(user.id)
        if (!context.isClient || !context.clientId || !context.clientCoachId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => ({}))
        const date = String(body?.date ?? '')
        const time = String(body?.time ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
            return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
        }

        const slots = (await dueSupplementSlots(context.clientId, date)).filter(slot => slot.time === time)
        if (slots.length === 0) return NextResponse.json({ logged: 0 })

        const admin = createAdminClient()
        const { data: existing } = await admin
            .from('supplement_dose_logs')
            .select('supplement_id')
            .eq('client_id', context.clientId)
            .eq('scheduled_date', date)
            .eq('scheduled_time', time)
        const already = new Set((existing ?? []).map(row => row.supplement_id as string))
        const missing = slots.filter(slot => !already.has(slot.supplementId))

        if (missing.length > 0) {
            const now = new Date().toISOString()
            const { error } = await admin.from('supplement_dose_logs').upsert(
                missing.map(slot => ({
                    supplement_id: slot.supplementId,
                    client_id: context.clientId,
                    coach_id: context.clientCoachId,
                    scheduled_date: date,
                    scheduled_time: time,
                    status: 'taken',
                    logged_at: now,
                })),
                { onConflict: 'supplement_id,scheduled_date,scheduled_time' }
            )
            if (error) throw error
        }

        await clearSupplementReminderIfDone(context.clientId, date)
        return NextResponse.json({ logged: missing.length })
    } catch (error) {
        console.error('[supplements/logs/slot]', error)
        return NextResponse.json({ error: 'No se pudo registrar la toma' }, { status: 500 })
    }
}
