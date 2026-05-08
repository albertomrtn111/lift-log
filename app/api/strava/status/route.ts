import { NextResponse } from 'next/server'
import { getAuthenticatedClientContext, getStravaStatus } from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const integration = await getStravaStatus(context)
        return NextResponse.json({
            provider: 'strava',
            status: integration?.status ?? 'disconnected',
            connectedAt: integration?.connected_at ?? null,
            lastSyncAt: integration?.last_sync_at ?? null,
            errorMessage: integration?.error_message ?? null,
            scope: integration?.scope ?? null,
        })
    } catch (error) {
        console.error('[strava/status]', error)
        return NextResponse.json({ error: 'No se pudo cargar el estado del conector' }, { status: 500 })
    }
}
