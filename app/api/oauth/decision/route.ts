import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
    const formData = await request.formData()
    const authorizationId = formData.get('authorization_id')
    const decision = formData.get('decision')

    if (typeof authorizationId !== 'string' || !authorizationId.trim()) {
        return NextResponse.json({ error: 'Falta authorization_id.' }, { status: 400 })
    }
    if (decision !== 'approve' && decision !== 'deny') {
        return NextResponse.json({ error: 'Decisión no válida.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return NextResponse.redirect(new URL('/login', request.url), 303)
    }

    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .limit(1)
        .maybeSingle()

    if (!membership) {
        return NextResponse.json({ error: 'Esta conexión solo está disponible para entrenadores.' }, { status: 403 })
    }

    const result = decision === 'approve'
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

    if (result.error || !result.data?.redirect_url) {
        return NextResponse.json({ error: result.error?.message ?? 'No se ha podido completar la autorización.' }, { status: 400 })
    }

    return NextResponse.redirect(result.data.redirect_url, 303)
}
