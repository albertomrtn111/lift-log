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

function isTime(value: unknown): value is string {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

export async function GET(request: NextRequest) {
    try {
        const context = await getClientContext()
        if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const date = new URL(request.url).searchParams.get('date')
        if (!isDate(date)) {
            return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('supplement_dose_logs')
            .select('id, supplement_id, scheduled_date, scheduled_time, status, logged_at')
            .eq('client_id', context.clientId)
            .eq('scheduled_date', date)
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

        if (!supplementId || !isDate(scheduledDate) || !isTime(scheduledTime) || !['taken', 'skipped'].includes(status)) {
            return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
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
