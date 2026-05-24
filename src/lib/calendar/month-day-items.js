export const MONTH_DAY_VISIBLE_ITEM_LIMIT = 4

export function getVisibleMonthDayItems(events, tasks, limit = MONTH_DAY_VISIBLE_ITEM_LIMIT) {
    const visibleEvents = events.slice(0, limit)
    const visibleTasks = tasks.slice(0, Math.max(0, limit - visibleEvents.length))

    return {
        visibleEvents,
        visibleTasks,
        hiddenItemCount: (events.length + tasks.length) - (visibleEvents.length + visibleTasks.length),
    }
}
