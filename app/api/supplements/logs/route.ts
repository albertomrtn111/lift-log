import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserContext } from '@/lib/auth/get-user-context'

export const dynamic = 'force-dynamic'

async function getClientContext() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const context = await getUserContext(user.id)
    if (!context.isClient || !context.clientId || !context.clientCoachId) return null

    return {
        clientId: context.clientId,
        coachId: context.clientCoachId,
    }
}

function isDate(value: string | null) {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Hora de la toma ("22:00") o, si el coach no fijó hora, "libre-N" (N-ésima toma
 * del día). La adherencia del coach cuenta estas últimas por día.
 */
function isDoseSlot(value: unknown): value is string {
    return typeof value === 'string' && (/^\d{2}:\d{2}$/.test(value) || /^libre-\d{1,2}$/.test(value))
}

function todayInMadrid() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export async function GET(request: NextRequest) {
    try {
        const context = await getClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const params = new URL(request.url).searchParams
        const date = params.get('date')
        const start = params.get('start')
        const end = params.get('end')

        if (!isDate(date) && (!isDate(start) || !isDate(end))) {
            return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
        }

        if (start && end && start > end) {
            return NextResponse.json({ error: 'Rango inválido' }, { status: 400 })
        }

        const supabase = createAdminClient()
        let query = supabase
            .from('supplement_dose_logs')
            .select('id, supplement_id, scheduled_date, scheduled_time, status, logged_at')
            .eq('client_id', context.clientId)

        if (date) {
            query = query.eq('scheduled_date', date)
        } else {
            query = query.gte('scheduled_date', start!).lte('scheduled_date', end!)
        }

        const { data, error } = await query
            .order('scheduled_date', { ascending: true })
            .order('scheduled_time', { ascending: true })

        if (error) throw error
        return NextResponse.json({ logs: data || [] })
    } catch (error) {
        console.error('[supplements/logs:GET]', error)
        return NextResponse.json({ error: 'No se pudo cargar el registro de suplementación' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const context = await getClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const supplementId = String(body?.supplementId || '')
        const scheduledDate = String(body?.scheduledDate || '')
        const scheduledTime = body?.scheduledTime
        const status = body?.status

        if (!supplementId || !isDate(scheduledDate) || !isDoseSlot(scheduledTime) || !['taken', 'skipped'].includes(status)) {
            return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
        }
        // Margen de un día por zonas horarias; no se registran tomas futuras
        if (scheduledDate > addDays(todayInMadrid(), 1)) {
            return NextResponse.json({ error: 'No puedes registrar tomas de días futuros' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const { data: supplement, error: supplementError } = await supabase
            .from('client_supplements')
            .select('id, client_id, coach_id, is_active')
            .eq('id', supplementId)
            .eq('client_id', context.clientId)
            .eq('is_active', true)
            .maybeSingle()

        if (supplementError) throw supplementError
        if (!supplement) return NextResponse.json({ error: 'Suplemento no encontrado' }, { status: 404 })

        const { data, error } = await supabase
            .from('supplement_dose_logs')
            .upsert({
                supplement_id: supplement.id,
                client_id: context.clientId,
                coach_id: context.coachId,
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                status,
                logged_at: new Date().toISOString(),
            }, { onConflict: 'supplement_id,scheduled_date,scheduled_time' })
            .select('id, supplement_id, scheduled_date, scheduled_time, status, logged_at')
            .single()

        if (error) throw error
        return NextResponse.json({ log: data })
    } catch (error) {
        console.error('[supplements/logs:POST]', error)
        return NextResponse.json({ error: 'No se pudo guardar la toma' }, { status: 500 })
    }
}

function addDays(date: string, days: number) {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/** Deshacer una toma registrada (vuelve a quedar pendiente) */
export async function DELETE(request: NextRequest) {
    try {
        const context = await getClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json().catch(() => ({}))
        const supplementId = String(body?.supplementId || '')
        const scheduledDate = String(body?.scheduledDate || '')
        const scheduledTime = body?.scheduledTime

        if (!supplementId || !isDate(scheduledDate) || !isDoseSlot(scheduledTime)) {
            return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const { error } = await supabase
            .from('supplement_dose_logs')
            .delete()
            .eq('client_id', context.clientId)
            .eq('supplement_id', supplementId)
            .eq('scheduled_date', scheduledDate)
            .eq('scheduled_time', scheduledTime)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('[supplements/logs:DELETE]', error)
        return NextResponse.json({ error: 'No se pudo deshacer la toma' }, { status: 500 })
    }
}
