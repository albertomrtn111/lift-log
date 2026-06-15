import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCalendarData, getCalendarDataForMonth } from '@/data/calendar'
import { CalendarView } from '@/components/coach/CalendarView'
import { Calendar } from 'lucide-react'

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
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Calendario</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Herramienta operativa para seguir revisiones reales, feedback y carga semanal.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
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
