import { Message } from '@/types/messages'

function compareMessagesByCreatedAt(a: Message, b: Message) {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

export function mergeUniqueMessages(messages: Message[]): Message[] {
    const byId = new Map<string, Message>()

    for (const message of messages) {
        const existing = byId.get(message.id)

        if (!existing || compareMessagesByCreatedAt(existing, message) <= 0) {
            byId.set(message.id, message)
        }
    }

    return Array.from(byId.values()).sort(compareMessagesByCreatedAt)
}

export function reconcileOptimisticMessage(
    messages: Message[],
    optimisticId: string,
    persistedMessage: Message,
): Message[] {
    return mergeUniqueMessages([
        ...messages.filter(message => message.id !== optimisticId),
        persistedMessage,
    ])
}

/** Margen para reconocer como propio un mensaje que llega del servidor (relojes distintos) */
const ECHO_WINDOW_MS = 15 * 60 * 1000

/**
 * Mensaje del atleta que llegó al servidor aunque la respuesta se perdiera
 * (cobertura mala): devuelve el id temporal («temp-…») que lo representa en
 * pantalla, para cambiarlo por el real en vez de dejarlo como «no enviado».
 */
export function findEchoedOptimisticId(messages: Message[], persisted: Message): string | null {
    if (persisted.id.startsWith('temp-')) return null
    const persistedAt = new Date(persisted.created_at).getTime()
    const match = messages.find(message =>
        message.id.startsWith('temp-')
        && message.sender_role === persisted.sender_role
        && (message.content ?? '') === (persisted.content ?? '')
        && (message.attachment_url ?? null) === (persisted.attachment_url ?? null)
        && Math.abs(new Date(message.created_at).getTime() - persistedAt) < ECHO_WINDOW_MS
    )
    return match?.id ?? null
}
