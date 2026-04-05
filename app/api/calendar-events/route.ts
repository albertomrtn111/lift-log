import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCalendarData, getCalendarDataForMonth } from '@/data/calendar'
import { NextResponse, NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
        const month = parseInt(searchParams.get('month') || String(new Date().getMonth()))
        const start = searchParams.get('start')
        const end = searchParams.get('end')

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ events: [], notes: [], tasks: [], notesEnabled: false, tasksEnabled: false, clientOptions: [] })
        }

        const coachId = await getCoachIdForUser(user.id)
        if (!coachId) {
            return NextResponse.json({ events: [], notes: [], tasks: [], notesEnabled: false, tasksEnabled: false, clientOptions: [] })
        }

        const data = start && end
            ? await getCalendarData(coachId, { startDate: start, endDate: end })
            : await getCalendarDataForMonth(coachId, year, month)

        return NextResponse.json(data)
    } catch {
        return NextResponse.json({ events: [], notes: [], tasks: [], notesEnabled: false, tasksEnabled: false, clientOptions: [] })
    }
}
