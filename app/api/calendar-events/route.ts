import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCalendarEvents } from '@/data/calendar'
import { NextResponse, NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
        const month = parseInt(searchParams.get('month') || String(new Date().getMonth()))

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json([])

        const coachId = await getCoachIdForUser(user.id)
        if (!coachId) return NextResponse.json([])

        const events = await getCalendarEvents(coachId, year, month)
        return NextResponse.json(events)
    } catch {
        return NextResponse.json([])
    }
}
