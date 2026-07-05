import { NextRequest, NextResponse } from 'next/server'
import {
    dispatchDueReviews,
    currentHourInTimezone,
    schedulerTimezone,
} from '@/lib/reviews/scheduler'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron de revisiones programadas — sustituye al flujo de n8n.
 *
 * Disparado por pg_cron (Supabase) a las 07:00 y 08:00 UTC. El endpoint solo
 * ejecuta cuando la hora local (Europe/Madrid) coincide con
 * REVIEW_SCHEDULER_HOUR (por defecto 9), de modo que el envío es a las 09:00
 * hora española todo el año, con o sin horario de verano.
 *
 * Seguridad: header `Authorization: Bearer <REVIEW_SCHEDULER_SECRET>`.
 * Fail-closed: sin secreto configurado, nadie ejecuta.
 *
 * Ejecución manual (ignora el filtro de hora): añadir `?force=1`.
 */

function getSecret(): string | null {
    return process.env.REVIEW_SCHEDULER_SECRET || process.env.CRON_SECRET || null
}

function isAuthorized(request: NextRequest): boolean {
    const secret = getSecret()
    if (!secret) return false
    return request.headers.get('authorization') === `Bearer ${secret}`
}

function targetHour(): number {
    const parsed = Number(process.env.REVIEW_SCHEDULER_HOUR ?? 9)
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 9
}

async function handle(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const force = new URL(request.url).searchParams.get('force') === '1'
    const tz = schedulerTimezone()
    const hourNow = currentHourInTimezone(tz)

    if (!force && hourNow !== targetHour()) {
        return NextResponse.json({
            ok: true,
            ran: false,
            reason: `Fuera de ventana: hora local ${hourNow}h (${tz}), objetivo ${targetHour()}h. Usa ?force=1 para forzar.`,
        })
    }

    try {
        const summary = await dispatchDueReviews()
        console.log(
            `[cron/reviews] ${summary.date} → due=${summary.due} sent=${summary.sent} skipped=${summary.skipped} errors=${summary.errors}`
        )
        return NextResponse.json({ ok: true, ran: true, ...summary })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[cron/reviews] Error:', message)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    return handle(request)
}

export async function GET(request: NextRequest) {
    return handle(request)
}
