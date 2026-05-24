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

function buildTimingLabel({ daysUntilFromWeekStart, weeksUntilFromWeekStart, daysAfterWeekEnd }) {
    if (daysAfterWeekEnd <= 0) {
        return `Evento dentro de la semana visible: faltan ${daysUntilFromWeekStart} dias (${weeksUntilFromWeekStart} semanas) desde el inicio.`
    }

    return `Faltan ${daysUntilFromWeekStart} dias (${weeksUntilFromWeekStart} semanas) desde el inicio de esta semana. Queda ${daysAfterWeekEnd} dias despues de cerrar la semana visible.`
}

export function buildPlanningEventContext({ weekStart, weekEnd, events }) {
    return events.map((event) => {
        const daysUntilFromWeekStart = diffDays(weekStart, event.event_date)
        const weeksUntilFromWeekStart = weeksFromDays(daysUntilFromWeekStart)
        const daysAfterWeekEnd = diffDays(weekEnd, event.event_date)

        return {
            title: event.title,
            date: event.event_date,
            type: event.event_type,
            priority: event.priority,
            location: event.location ?? null,
            target: event.target ?? null,
            notes: event.notes ?? null,
            daysUntilFromWeekStart,
            weeksUntilFromWeekStart,
            daysAfterWeekEnd,
            timingLabel: buildTimingLabel({
                daysUntilFromWeekStart,
                weeksUntilFromWeekStart,
                daysAfterWeekEnd,
            }),
        }
    })
}
