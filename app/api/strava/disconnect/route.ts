import { NextResponse } from 'next/server'
import { disconnectStrava, getAuthenticatedClientContext } from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        await disconnectStrava(context)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('[strava/disconnect]', error)
        return NextResponse.json({ error: 'No se pudo desconectar Strava' }, { status: 500 })
    }
}
