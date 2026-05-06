import { NextResponse } from 'next/server'
import { getAuthenticatedClientContext, getPendingStravaActivities } from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activities = await getPendingStravaActivities(context)
        return NextResponse.json({ activities })
    } catch (error) {
        console.error('[strava/activities/pending]', error)
        return NextResponse.json({ error: 'No se pudieron cargar actividades pendientes' }, { status: 500 })
    }
}
