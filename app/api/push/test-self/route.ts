import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { isPushServerConfigured, sendPushToClient, sendPushToCoach } from '@/lib/push'
import { logDelivery } from '@/lib/notifications/delivery-log'

/**
 * Aviso de prueba a los dispositivos del propio usuario: el atleta desde su
 * perfil, el coach desde Ajustes → Notificaciones. Body: { audience: 'client' | 'coach' }.
 * Responde a cuántos dispositivos se envió y a cuántos llegó.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!isPushServerConfigured()) {
        return NextResponse.json({ error: 'Las notificaciones push no están configuradas en este servidor.' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const audience = body?.audience === 'coach' ? 'coach' : 'client'
    const payload = {
        title: 'Prueba de notificaciones',
        body: 'Si ves esto, los avisos de NexTrain llegan a este dispositivo.',
        tag: 'push-test',
    }

    if (audience === 'coach') {
        const coachId = await getCoachIdForUser(user.id)
        if (!coachId) return NextResponse.json({ error: 'No eres coach' }, { status: 403 })

        const result = await sendPushToCoach(coachId, { ...payload, url: '/coach/settings' })
        await logDelivery({ audience: 'coach', coachId, kind: 'push_test', status: (result.deliveredCount ?? 0) > 0 ? 'sent' : 'failed', push: result })
        return NextResponse.json({ devices: result.subscriptionCount ?? 0, delivered: result.deliveredCount ?? 0 })
    }

    const { data: clientRow } = await supabase
        .from('clients')
        .select('id')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('status', 'active')
        .maybeSingle()
    if (!clientRow) return NextResponse.json({ error: 'No tienes una ficha de atleta activa' }, { status: 403 })

    const result = await sendPushToClient(clientRow.id, { ...payload, url: '/profile' })
    await logDelivery({ audience: 'client', clientId: clientRow.id, kind: 'push_test', status: (result.deliveredCount ?? 0) > 0 ? 'sent' : 'failed', push: result })
    return NextResponse.json({ devices: result.subscriptionCount ?? 0, delivered: result.deliveredCount ?? 0 })
}
