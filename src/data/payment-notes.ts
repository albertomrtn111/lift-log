import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentNoteRow } from '@/lib/billing/payment-notes'

/**
 * Notas de cobro de estos atletas, con la sesión del coach (RLS: solo su equipo).
 * Un fallo aquí no debe dejar al coach sin su lista: se registra y se devuelve vacía.
 */
export async function loadPaymentNotes(
    supabase: SupabaseClient,
    clientIds: string[]
): Promise<PaymentNoteRow[]> {
    if (clientIds.length === 0) return []
    const { data, error } = await supabase
        .from('client_payment_notes')
        .select('client_id, notes')
        .in('client_id', clientIds)
    if (error) {
        console.error('[loadPaymentNotes]', error.message)
        return []
    }
    return (data ?? []) as PaymentNoteRow[]
}

/** Guarda la nota de cobro; null la quita. */
export async function savePaymentNote(
    supabase: SupabaseClient,
    clientId: string,
    note: string | null
): Promise<{ success: boolean; error?: string }> {
    const { error } = note === null
        ? await supabase.from('client_payment_notes').delete().eq('client_id', clientId)
        : await supabase
            .from('client_payment_notes')
            .upsert({ client_id: clientId, notes: note, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    if (error) {
        console.error('[savePaymentNote]', error.message)
        return { success: false, error: error.message }
    }
    return { success: true }
}
