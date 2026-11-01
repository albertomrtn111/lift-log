import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { zonedClock } from '@/lib/notifications/quiet-hours'
import { getClientDeliverySettings } from '@/lib/notifications/delivery-settings'

type SupplementRow = {
    id: string
    dose_schedule: string[] | null
    start_date: string | null
    end_date: string | null
}

function isActiveOn(row: SupplementRow, date: string) {
    return (!row.start_date || row.start_date <= date) && (!row.end_date || row.end_date >= date)
}

/** Tomas con hora de ese día que ya deberían estar hechas (supplement_id|hora). */
export async function dueSupplementSlots(clientId: string, date: string): Promise<Array<{ supplementId: string; time: string }>> {
    const admin = createAdminClient()
    const { timezone } = await getClientDeliverySettings(clientId)
    const clock = zonedClock(new Date(), timezone ?? process.env.SUPPLEMENT_REMINDER_TIMEZONE ?? 'Europe/Madrid')

    const { data } = await admin
        .from('client_supplements')
        .select('id, dose_schedule, start_date, end_date')
        .eq('client_id', clientId)
        .eq('is_active', true)

    const slots: Array<{ supplementId: string; time: string }> = []
    for (const row of (data ?? []) as SupplementRow[]) {
        if (!isActiveOn(row, date)) continue
        for (const time of row.dose_schedule ?? []) {
            if (!/^\d{2}:\d{2}$/.test(time)) continue
            const [h, m] = time.split(':').map(Number)
            const due = date < clock.dateKey || (date === clock.dateKey && h * 60 + m <= clock.minutes)
            if (due) slots.push({ supplementId: row.id, time })
        }
    }
    return slots
}

/**
 * Si ya están registradas todas las tomas pendientes del día, el recordatorio
 * de ese día deja de estar sin leer. Nunca lanza.
 */
export async function clearSupplementReminderIfDone(clientId: string, date: string): Promise<void> {
    try {
        const admin = createAdminClient()
        const slots = await dueSupplementSlots(clientId, date)
        if (slots.length > 0) {
            const { data: logs } = await admin
                .from('supplement_dose_logs')
                .select('supplement_id, scheduled_time')
                .eq('client_id', clientId)
                .eq('scheduled_date', date)
            const logged = new Set((logs ?? []).map(l => `${l.supplement_id}|${l.scheduled_time}`))
            if (slots.some(slot => !logged.has(`${slot.supplementId}|${slot.time}`))) return
        }

        await admin
            .from('client_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('client_id', clientId)
            .eq('type', 'supplement')
            .eq('is_read', false)
            .eq('url', `/diet?tab=supplements&date=${date}`)
    } catch (error) {
        console.warn('[supplements] No se pudo cerrar el recordatorio:', error)
    }
}
