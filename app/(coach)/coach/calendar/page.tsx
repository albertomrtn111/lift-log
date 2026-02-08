import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCalendarEvents } from '@/data/calendar'
import { CalendarView } from '@/components/coach/CalendarView'
import { Badge } from '@/components/ui/badge'
import { Calendar } from 'lucide-react'

interface CalendarPageProps {
    searchParams: Promise<{ month?: string; year?: string }>
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    // Get current month/year from params or default to now
    const now = new Date()
    const year = params.year ? parseInt(params.year) : now.getFullYear()
    const month = params.month ? parseInt(params.month) : now.getMonth()

    const events = await getCalendarEvents(coachId, year, month)
    const urgentCount = events.filter(e => e.isUrgent).length

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-success" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Calendario</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary">{events.length} check-ins</Badge>
                                {urgentCount > 0 && (
                                    <Badge variant="destructive">{urgentCount} urgentes</Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
                <CalendarView
                    events={events}
                    initialYear={year}
                    initialMonth={month}
                />
            </div>
        </div>
    )
}
