import { NextResponse } from 'next/server'
import { getAuthenticatedClientContext, getStravaStatus } from '@/lib/strava/client'
import {
    hasRequiredStravaActivityScope,
    STRAVA_ACTIVITY_PERMISSION_ERROR,
} from '@/lib/strava/scopes'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const integration = await getStravaStatus(context)
        const hasRequiredPermissions = integration
            ? hasRequiredStravaActivityScope(integration.scope)
            : false
        const requiresReauthorization = Boolean(
            integration
            && integration.status !== 'disconnected'
            && integration.status !== 'revoked'
            && !hasRequiredPermissions
        )

        return NextResponse.json({
            provider: 'strava',
            status: requiresReauthorization ? 'error' : integration?.status ?? 'disconnected',
            connectedAt: integration?.connected_at ?? null,
            lastSyncAt: integration?.last_sync_at ?? null,
            errorMessage: requiresReauthorization
                ? STRAVA_ACTIVITY_PERMISSION_ERROR
                : integration?.error_message ?? null,
            scope: integration?.scope ?? null,
            hasRequiredPermissions,
            requiresReauthorization,
        })
    } catch (error) {
        console.error('[strava/status]', error)
        return NextResponse.json({ error: 'No se pudo cargar el estado del conector' }, { status: 500 })
    }
}
