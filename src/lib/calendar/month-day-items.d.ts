export const MONTH_DAY_VISIBLE_ITEM_LIMIT: 4

export function getVisibleMonthDayItems<EventItem, TaskItem>(
    events: EventItem[],
    tasks: TaskItem[],
    limit?: number,
): {
    visibleEvents: EventItem[]
    visibleTasks: TaskItem[]
    hiddenItemCount: number
}
