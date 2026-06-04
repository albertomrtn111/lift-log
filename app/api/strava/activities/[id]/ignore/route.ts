import { NextResponse } from 'next/server'
import { getAuthenticatedClientContext, ignoreStravaActivity } from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function POST(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        await ignoreStravaActivity(context, params.id)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('[strava/activities/:id/ignore]', error)
        return NextResponse.json({ error: 'No se pudo ignorar la actividad' }, { status: 500 })
    }
}
