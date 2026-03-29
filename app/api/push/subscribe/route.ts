import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            console.error('[push/subscribe] Auth failed:', authError?.message)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('[push/subscribe] User:', user.id, user.email)

        const context = await getUserContext(user.id)
        console.log('[push/subscribe] Context: isClient=', context.isClient, 'clientId=', context.clientId, 'isCoach=', context.isCoach)

        if (!context.isClient || !context.clientId) {
            console.error('[push/subscribe] ❌ User is not a client! isClient:', context.isClient, 'clientId:', context.clientId)
            return NextResponse.json({ error: 'Not a client', debug: { isClient: context.isClient, clientId: context.clientId } }, { status: 403 })
        }

        const body = await request.json()
        const { endpoint, keys, userAgent } = body

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            console.error('[push/subscribe] Invalid body:', { endpoint: !!endpoint, p256dh: !!keys?.p256dh, auth: !!keys?.auth })
            return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
        }

        console.log('[push/subscribe] Saving subscription for client:', context.clientId, 'endpoint:', endpoint.substring(0, 50))

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
            console.error('[push/subscribe] ❌ DB upsert error:', error.code, error.message, error.details, error.hint)
            return NextResponse.json({ error: 'Failed to save subscription', detail: error.message }, { status: 500 })
        }

        console.log('[push/subscribe] ✅ Subscription saved for client:', context.clientId)
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
