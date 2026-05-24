const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseLocalDate(value) {
    return new Date(`${value}T12:00:00`)
}

export function buildEventTiming(referenceDate, eventDate) {
    const ref = parseLocalDate(referenceDate)
    const event = parseLocalDate(eventDate)
    const daysUntil = Math.round((event.getTime() - ref.getTime()) / MS_PER_DAY)
    const weeksUntil = Number((daysUntil / 7).toFixed(1))

    return {
        daysUntil,
        weeksUntil,
        label:
            daysUntil === 0
                ? 'Es hoy'
                : daysUntil > 0
                    ? `Faltan ${daysUntil} dias (${weeksUntil} semanas)`
                    : `Fue hace ${Math.abs(daysUntil)} dias`,
    }
}

export function takeRecentChatMessages(messages, limit = 12) {
    return [...messages]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(-limit)
}

export function formatContextSections(sections) {
    return sections
        .map((section) => ({
            title: section.title,
            content: typeof section.content === 'string' ? section.content.trim() : '',
        }))
        .filter((section) => section.content.length > 0)
        .map((section) => `## ${section.title}\n${section.content}`)
        .join('\n\n')
}
