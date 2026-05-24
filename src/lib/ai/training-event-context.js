function parseLocalDate(value) {
    return new Date(`${value}T12:00:00`)
}

function diffDays(fromDate, toDate) {
    const msPerDay = 24 * 60 * 60 * 1000
    return Math.round((parseLocalDate(toDate).getTime() - parseLocalDate(fromDate).getTime()) / msPerDay)
}

function weeksFromDays(days) {
    return Math.round((days / 7) * 10) / 10
}

export function buildTrainingEventContext({ referenceDate, events }) {
    return events.map((event) => {
        const daysUntil = diffDays(referenceDate, event.event_date)
        const weeksUntil = weeksFromDays(daysUntil)

        return {
            title: event.title,
            date: event.event_date,
            type: event.event_type,
            priority: event.priority,
            location: event.location ?? null,
            target: event.target ?? null,
            notes: event.notes ?? null,
            daysUntil,
            weeksUntil,
            timingLabel: `Faltan ${daysUntil} dias (${weeksUntil} semanas) desde hoy.`,
        }
    })
}
