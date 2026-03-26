import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const context = await getUserContext(user.id)
        if (!context.isClient || !context.clientId) {
            return NextResponse.json({ error: 'Not a client' }, { status: 403 })
        }

        const body = await request.json()
        const { endpoint, keys, userAgent } = body

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
        }

        // Upsert: si ya existe este endpoint para este cliente, actualiza; si no, inserta
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                client_id: context.clientId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                user_agent: userAgent || null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'client_id,endpoint',
            })

        if (error) {
            console.error('[push/subscribe] Error saving subscription:', error)
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[push/subscribe] Unexpected error:', error)
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

        if (!endpoint) {
            return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
        }

        await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
