import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getSidebarBadges } from '@/data/dashboard'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return NextResponse.json({ dashboardPending: 0, membersPendingSignup: 0, messagesUnread: 0 }, { headers: { 'Cache-Control': 'no-store' } })

        const coachId = await getCoachIdForUser(user.id)
        if (!coachId) return NextResponse.json({ dashboardPending: 0, membersPendingSignup: 0, messagesUnread: 0 }, { headers: { 'Cache-Control': 'no-store' } })

        const badges = await getSidebarBadges(coachId)
        return NextResponse.json(badges, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
        return NextResponse.json({ dashboardPending: 0, membersPendingSignup: 0, messagesUnread: 0 }, { headers: { 'Cache-Control': 'no-store' } })
    }
}
