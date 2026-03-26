import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'

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

    const { sendPushToClient } = await import('@/lib/push')
    await sendPushToClient(clientId, {
        title: '🔔 Notificación de prueba',
        body: 'Si ves esto, las push notifications están funcionando correctamente.',
        url: '/chat',
        tag: 'test',
    })

    return NextResponse.json({ success: true, message: 'Notificación enviada (revisa los logs del servidor)' })
}
