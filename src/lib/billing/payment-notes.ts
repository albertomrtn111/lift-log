// Notas de cobro de cada atleta. Viven en client_payment_notes, que solo ve el
// equipo del coach; la ficha del atleta (clients) ya no las guarda.

export interface PaymentNoteRow {
    client_id: string
    notes: string | null
}

/** Texto que se guarda, o null si no queda nada (entonces la nota se quita). */
export function normalizePaymentNote(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

/**
 * Separa la nota de cobro del resto de cambios de la ficha.
 * `paymentNote` undefined = no tocar la nota; null = quitarla.
 */
export function splitPaymentNote<T extends { payment_notes?: string | null }>(
    updates: T
): { clientUpdates: Omit<T, 'payment_notes'>; paymentNote: string | null | undefined } {
    const { payment_notes, ...clientUpdates } = updates
    return {
        clientUpdates,
        paymentNote: payment_notes === undefined ? undefined : normalizePaymentNote(payment_notes),
    }
}

/**
 * Pone a cada ficha su nota de cobro (o null). Ignora lo que traiga
 * clients.payment_notes: esa columna deja de usarse y puede estar desfasada.
 */
export function attachPaymentNotes<T extends { id: string }>(
    clients: T[],
    rows: PaymentNoteRow[] | null | undefined
): Array<T & { payment_notes: string | null }> {
    const byClient = new Map<string, string>()
    for (const row of rows ?? []) {
        const note = normalizePaymentNote(row?.notes)
        if (row?.client_id && note) byClient.set(row.client_id, note)
    }
    return clients.map(client => ({ ...client, payment_notes: byClient.get(client.id) ?? null }))
}
