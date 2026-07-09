import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const coachId = await getCoachIdForUser(user.id)
        if (!coachId) {
            return NextResponse.json({ error: 'Not a coach' }, { status: 403 })
        }

        const body = await request.json()
        const { endpoint, keys, userAgent } = body

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
        }

        const { error: upsertError } = await supabase
            .from('coach_push_subscriptions')
            .upsert({
                coach_id: coachId,
                user_id: user.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                user_agent: userAgent || null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,endpoint',
            })

        if (upsertError) {
            console.error('[push/subscribe-coach] Upsert error:', upsertError.message)
            return NextResponse.json({ error: 'Failed to save', detail: upsertError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, coachId })
    } catch (error) {
        console.error('[push/subscribe-coach] Unexpected error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const { endpoint } = body
        if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

        await supabase
            .from('coach_push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', endpoint)

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
