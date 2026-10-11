import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCalendarData, getCalendarDataForMonth } from '@/data/calendar'
import { CalendarView } from '@/components/coach/CalendarView'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'

interface CalendarPageProps {
    searchParams: Promise<{ month?: string; year?: string; view?: string; start?: string }>
}

function formatDateKey(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function startOfMondayWeek(date: Date) {
    const copy = new Date(date)
    const offset = (copy.getDay() + 6) % 7
    copy.setDate(copy.getDate() - offset)
    copy.setHours(12, 0, 0, 0)
    return copy
}

function parseLocalDate(dateStr?: string) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
    return new Date(`${dateStr}T12:00:00`)
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const now = new Date()
    const year = params.year ? parseInt(params.year) : now.getFullYear()
    const month = params.month ? parseInt(params.month) : now.getMonth()
    const hasExplicitMonth = Boolean(params.year || params.month)
    const initialViewMode = params.view === 'month' || (!params.view && hasExplicitMonth) ? 'month' : 'week'
    const initialWeekStart = startOfMondayWeek(parseLocalDate(params.start) ?? now)

    const calendarData = initialViewMode === 'month'
        ? await getCalendarDataForMonth(coachId, year, month)
        : await getCalendarData(coachId, {
            startDate: formatDateKey(initialWeekStart),
            endDate: formatDateKey(new Date(initialWeekStart.getFullYear(), initialWeekStart.getMonth(), initialWeekStart.getDate() + 6)),
        })

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            <CoachPageHeader
                eyebrow="Operativa"
                title="Calendario"
                description="Revisiones, feedback y carga semanal de tus atletas."
            />

            <div className="px-4 pt-4 lg:px-8 lg:pt-6">
                <CalendarView
                    coachId={coachId}
                    initialData={calendarData}
                    initialYear={year}
                    initialMonth={month}
                    initialViewMode={initialViewMode}
                    initialWeekStart={formatDateKey(initialWeekStart)}
                />
            </div>
        </div>
    )
}
