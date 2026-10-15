import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { BillingLedgerData } from '@/types/billing'
import { dueDateFor, isBillable, feeOf, monthsMissedWhileInactive, type LedgerClient, type LedgerRecord } from '@/lib/billing/ledger'

export type { BillingLedgerData } from '@/types/billing'

/** Hoy (YYYY-MM-DD) en la zona horaria del coach */
export function todayKeyIn(timeZone: string | null | undefined) {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timeZone || 'Europe/Madrid',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date())
    } catch {
        return new Date().toISOString().slice(0, 10)
    }
}

/** Nota de los cobros que se eximen automáticamente al dar de baja */
const DEACTIVATION_NOTE = 'Exento por baja'

export async function getCoachBillingSettings(coachId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('timezone, currency')
        .eq('id', coachId)
        .maybeSingle()
    return {
        timeZone: (data?.timezone as string | null) || 'Europe/Madrid',
        currency: (data?.currency as string | null) || 'EUR',
    }
}

/**
 * Todo lo necesario para pintar un año de facturación: atletas y registros.
 * Los cálculos (quién debe, vencidos, previsión) los hace el motor puro en
 * `lib/billing/ledger`, igual en servidor y cliente.
 */
export async function getBillingLedger(coachId: string, year: number): Promise<BillingLedgerData> {
    const supabase = await createClient()
    const { timeZone, currency } = await getCoachBillingSettings(coachId)
    const today = todayKeyIn(timeZone)
    const currentYear = Number(today.slice(0, 4))
    const currentMonth = Number(today.slice(5, 7))

    // Los pendientes de meses ya cerrados se guardan como vencidos para que el
    // resto de la app (dashboard, avisos) los vea igual que esta pantalla.
    if (year < currentYear) {
        await supabase.from('payment_records')
            .update({ status: 'overdue', updated_at: new Date().toISOString() })
            .eq('coach_id', coachId).eq('year', year).eq('status', 'pending')
    } else if (year === currentYear && currentMonth > 1) {
        await supabase.from('payment_records')
            .update({ status: 'overdue', updated_at: new Date().toISOString() })
            .eq('coach_id', coachId).eq('year', year).lt('month', currentMonth).eq('status', 'pending')
    }

    const [{ data: clients }, { data: records }, { data: previousYear }] = await Promise.all([
        supabase
            .from('clients')
            .select('id, full_name, email, status, start_date, created_at, payment_amount, payment_day, deactivated_at')
            .eq('coach_id', coachId)
            .order('full_name', { ascending: true }),
        supabase
            .from('payment_records')
            .select('id, client_id, year, month, amount, status, paid_at, payment_method, notes')
            .eq('coach_id', coachId)
            .eq('year', year),
        supabase
            .from('payment_records')
            .select('amount')
            .eq('coach_id', coachId)
            .eq('year', year - 1)
            .eq('status', 'paid'),
    ])

    return {
        year,
        today,
        currency,
        clients: (clients ?? []) as LedgerClient[],
        records: (records ?? []).map(record => ({ ...record, amount: Number(record.amount) })) as LedgerRecord[],
        previousYearCollected: (previousYear ?? []).reduce((sum, record) => sum + Number(record.amount), 0),
    }
}

/**
 * Crea los cobros del mes en curso para quien deba pagarlo. Solo se usa con
 * el mes actual: los meses pasados sin registro se muestran como «sin
 * registrar» y el coach decide, para no inventar deudas.
 */
export async function generateMonthlyRecords(coachId: string, year: number, month: number) {
    const supabase = await createClient()

    const { data: clients, error: clientsErr } = await supabase
        .from('clients')
        .select('id, full_name, email, status, start_date, created_at, payment_amount, payment_day, deactivated_at')
        .eq('coach_id', coachId)
        .eq('status', 'active')

    if (clientsErr) {
        console.error('Error loading clients for monthly billing:', clientsErr)
        return { success: false, error: clientsErr.message }
    }

    const recordsToInsert = ((clients ?? []) as LedgerClient[])
        .filter(client => isBillable(client, year, month))
        .map(client => ({
            coach_id: coachId,
            client_id: client.id,
            year,
            month,
            amount: feeOf(client),
            status: 'pending',
        }))

    if (recordsToInsert.length === 0) {
        return { success: true, generatedCount: 0 }
    }

    const { error: insertErr } = await supabase
        .from('payment_records')
        .upsert(recordsToInsert, { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true })

    if (insertErr) {
        console.error('Error generating monthly records:', insertErr)
        return { success: false, error: insertErr.message }
    }

    revalidatePath('/coach/billing')
    return { success: true, generatedCount: recordsToInsert.length }
}

/**
 * Tras crear, editar o reactivar un atleta: deja su cobro del mes en curso
 * al día (lo crea si debe pagar y actualiza el importe si sigue pendiente).
 * Nunca toca meses pasados.
 */
export async function syncClientCurrentMonth(coachId: string, clientId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { timeZone } = await getCoachBillingSettings(coachId)
    const today = todayKeyIn(timeZone)
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))

    const { data: client } = await supabase
        .from('clients')
        .select('id, full_name, email, status, start_date, created_at, payment_amount, payment_day, deactivated_at')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()
    if (!client || client.status !== 'active' || !isBillable(client as LedgerClient, year, month)) return { success: true }

    const amount = feeOf(client as LedgerClient)
    const now = new Date().toISOString()
    await supabase
        .from('payment_records')
        .update({ amount, updated_at: now })
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'pending')

    const { error } = await supabase
        .from('payment_records')
        .upsert(
            { coach_id: coachId, client_id: clientId, year, month, amount, status: 'pending' },
            { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true },
        )
    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/billing')
    return { success: true }
}

/**
 * Al dar de baja (`today` es el día de la baja): si el cobro del mes en curso
 * sigue pendiente y su día de cobro aún no ha llegado, ya no lo debe y se
 * marca como exento. Si ya venció es deuda real y se queda como está; los
 * cobrados no se tocan.
 */
export async function waiveCurrentMonthOnDeactivation(coachId: string, clientId: string, today: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))

    const [{ data: client }, { data: record }] = await Promise.all([
        supabase.from('clients').select('payment_day').eq('id', clientId).eq('coach_id', coachId).maybeSingle(),
        supabase.from('payment_records')
            .select('id, status, notes')
            .eq('coach_id', coachId).eq('client_id', clientId).eq('year', year).eq('month', month)
            .maybeSingle(),
    ])
    if (!client || !record || !['pending', 'overdue'].includes(record.status)) return { success: true }
    if (today > dueDateFor(year, month, client.payment_day)) return { success: true }

    const { error } = await supabase
        .from('payment_records')
        .update({ status: 'waived', notes: record.notes || DEACTIVATION_NOTE, updated_at: new Date().toISOString() })
        .eq('id', record.id)
        .eq('coach_id', coachId)
    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/billing')
    return { success: true }
}

/**
 * Antes de reactivar (con el atleta aún de baja): los meses que se perdió
 * quedan registrados como exentos, porque al volver a estar activo dejarían
 * de distinguirse de meses sin cobrar. Si el cobro del mes en curso se eximió
 * por la baja y aún no ha llegado su día de cobro, vuelve a pendiente.
 */
export async function settleBillingBeforeReactivation(coachId: string, clientId: string, today: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))

    const { data: client } = await supabase
        .from('clients')
        .select('id, full_name, email, status, start_date, created_at, payment_amount, payment_day, deactivated_at')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()
    if (!client) return { success: true }

    const missed = monthsMissedWhileInactive(client as LedgerClient, today).map(period => ({
        coach_id: coachId,
        client_id: clientId,
        year: period.year,
        month: period.month,
        amount: feeOf(client as LedgerClient),
        status: 'waived',
        notes: DEACTIVATION_NOTE,
    }))
    if (missed.length > 0) {
        const { error } = await supabase
            .from('payment_records')
            .upsert(missed, { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true })
        if (error) return { success: false, error: error.message }
    }

    if (today <= dueDateFor(year, month, client.payment_day)) {
        const { error } = await supabase
            .from('payment_records')
            .update({ status: 'pending', notes: null, updated_at: new Date().toISOString() })
            .eq('coach_id', coachId).eq('client_id', clientId).eq('year', year).eq('month', month)
            .eq('status', 'waived')
            .eq('notes', DEACTIVATION_NOTE)
        if (error) return { success: false, error: error.message }
    }

    revalidatePath('/coach/billing')
    return { success: true }
}

export async function ensureCurrentMonthRecords(coachId: string) {
    const { timeZone } = await getCoachBillingSettings(coachId)
    const today = todayKeyIn(timeZone)
    return generateMonthlyRecords(coachId, Number(today.slice(0, 4)), Number(today.slice(5, 7)))
}
