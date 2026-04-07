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
