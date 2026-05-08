import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedClientContext, syncRecentStravaActivities } from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json().catch(() => ({}))
        const result = await syncRecentStravaActivities(context, Number(body?.perPage ?? 20))
        return NextResponse.json({ ok: true, ...result })
    } catch (error) {
        console.error('[strava/sync]', error)
        return NextResponse.json({ error: 'No se pudo sincronizar el conector' }, { status: 500 })
    }
}
