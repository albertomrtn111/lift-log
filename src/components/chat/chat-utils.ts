import type { Message } from '@/types/messages'
import type { DeliveryState } from './ChatMessageBubble'

/** Mensajes seguidos del mismo autor a menos de esto se agrupan visualmente */
const GROUP_WINDOW_MS = 5 * 60 * 1000

export function deliveryOf(message: Message, failedIds: Set<string>): DeliveryState {
    if (failedIds.has(message.id)) return 'failed'
    if (message.id.startsWith('temp-')) return 'sending'
    return message.read_at ? 'read' : 'sent'
}

export function sameGroup(a: Message | undefined, b: Message | undefined) {
    if (!a || !b) return false
    if (a.message_type === 'review_feedback' || b.message_type === 'review_feedback') return false
    return a.sender_role === b.sender_role
        && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < GROUP_WINDOW_MS
}

export function groupByDay(messages: Message[]) {
    const days: { key: string; date: Date; messages: Message[] }[] = []
    for (const message of messages) {
        const date = new Date(message.created_at)
        const key = date.toDateString()
        const current = days[days.length - 1]
        if (current?.key === key) current.messages.push(message)
        else days.push({ key, date, messages: [message] })
    }
    return days
}

export function formatDaySeparator(date: Date) {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Hoy'
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

    const diffDays = (today.getTime() - date.getTime()) / 86_400_000
    if (diffDays < 7) return date.toLocaleDateString('es-ES', { weekday: 'long' })

    return date.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    })
}

export function formatReadAt(dateStr: string) {
    const date = new Date(dateStr)
    const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    return date.toDateString() === new Date().toDateString()
        ? `a las ${time}`
        : `el ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
}

export function initialsOf(name: string, fallback = '?') {
    return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || fallback
}
