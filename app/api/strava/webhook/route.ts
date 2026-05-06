import { NextRequest, NextResponse } from 'next/server'
import {
    getStravaEnv,
    processStravaWebhookEvent,
    validateWebhookEvent,
} from '@/lib/strava/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const env = getStravaEnv()
        const url = new URL(request.url)
        const mode = url.searchParams.get('hub.mode')
        const token = url.searchParams.get('hub.verify_token')
        const challenge = url.searchParams.get('hub.challenge')

        if (mode === 'subscribe' && token === env.verifyToken && challenge) {
            return NextResponse.json({ 'hub.challenge': challenge })
        }

        return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 })
    } catch (error) {
        console.error('[strava/webhook:GET]', error)
        return NextResponse.json({ error: 'Webhook verification failed' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null)
        const event = validateWebhookEvent(body)
        if (!event) {
            return NextResponse.json({ ok: true, ignored: true })
        }

        // Inline for v1. This call is centralized so it can move to a queue
        // without changing Strava's callback surface.
        await processStravaWebhookEvent(event)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('[strava/webhook:POST]', error)
        return NextResponse.json({ ok: true })
    }
}
