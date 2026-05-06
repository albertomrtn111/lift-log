import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedClientContext, saveStravaActivityFeedback } from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const context = await getAuthenticatedClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const rpe = Number(body?.rpe)
        if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
            return NextResponse.json({ error: 'RPE inválido' }, { status: 400 })
        }

        const result = await saveStravaActivityFeedback(context, params.id, {
            rpe,
            athleteNotes: typeof body?.athleteNotes === 'string' ? body.athleteNotes.trim() || null : null,
        })
        return NextResponse.json({ ok: true, ...result })
    } catch (error) {
        console.error('[strava/activities/:id/feedback]', error)
        return NextResponse.json({ error: 'No se pudo guardar el feedback' }, { status: 500 })
    }
}
