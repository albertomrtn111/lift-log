import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'
import { isPushServerConfigured, sendPushToClient } from '@/lib/push'

// Solo accesible para coaches — envía notificación de prueba a un clientId
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getUserContext(user.id)
    if (!context.isCoach) {
        return NextResponse.json({ error: 'Solo coaches pueden usar este endpoint' }, { status: 403 })
    }

    const { clientId } = await request.json()
    if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

    // El atleta tiene que pertenecer a un coach donde el usuario tenga membresía activa.
    const { data: client } = await supabase
        .from('clients')
        .select('coach_id')
        .eq('id', clientId)
        .maybeSingle()

    const { data: membership } = client
        ? await supabase
            .from('coach_memberships')
            .select('coach_id')
            .eq('user_id', user.id)
            .eq('coach_id', client.coach_id)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null }

    if (!membership) {
        return NextResponse.json({ error: 'Atleta no encontrado' }, { status: 404 })
    }

    if (!isPushServerConfigured()) {
        return NextResponse.json({
            success: false,
            error: 'Push notifications no configuradas en este entorno.',
        }, { status: 503 })
    }

    const result = await sendPushToClient(clientId, {
        title: '🔔 Notificación de prueba',
        body: 'Si ves esto, las push notifications están funcionando correctamente.',
        url: '/chat',
        tag: 'test',
    })

    return NextResponse.json({
        success: result.ok,
        message: result.ok
            ? `Notificación procesada. Suscripciones: ${result.subscriptionCount ?? 0}, enviadas: ${result.deliveredCount ?? 0}`
            : 'No se pudo procesar la notificación de prueba.',
        clientId,
        push: result,
    })
}
