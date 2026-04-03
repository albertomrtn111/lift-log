import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            console.error('[push/subscribe] Auth failed:', authError?.message)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('[push/subscribe] User:', user.id, user.email)

        // Consultar clients directamente — más robusto que depender de get_my_roles()
        const { data: clientRow, error: clientError } = await supabase
            .from('clients')
            .select('id, coach_id, status')
            .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
            .eq('status', 'active')
            .maybeSingle()

        if (clientError) {
            console.error('[push/subscribe] Error querying clients:', clientError)
            return NextResponse.json({ error: 'DB error', detail: clientError.message }, { status: 500 })
        }

        if (!clientRow) {
            console.error('[push/subscribe] ❌ No active client record for user:', user.id)
            return NextResponse.json({ error: 'Not a client' }, { status: 403 })
        }

        console.log('[push/subscribe] Client found:', clientRow.id, 'coach:', clientRow.coach_id)

        const body = await request.json()
        const { endpoint, keys, userAgent } = body

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            console.error('[push/subscribe] Invalid body:', { endpoint: !!endpoint, p256dh: !!keys?.p256dh, auth: !!keys?.auth })
            return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
        }

        console.log('[push/subscribe] Saving for client:', clientRow.id, 'endpoint:', endpoint.substring(0, 60) + '...')

        const { error: upsertError } = await supabase
            .from('push_subscriptions')
            .upsert({
                client_id: clientRow.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                user_agent: userAgent || null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'client_id,endpoint',
            })

        if (upsertError) {
            console.error('[push/subscribe] ❌ Upsert error:', upsertError.code, upsertError.message, upsertError.details, upsertError.hint)
            return NextResponse.json({ error: 'Failed to save', detail: upsertError.message }, { status: 500 })
        }

        console.log('[push/subscribe] ✅ Subscription saved for client:', clientRow.id)
        return NextResponse.json({ success: true, clientId: clientRow.id })

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
        if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

        await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)

        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
