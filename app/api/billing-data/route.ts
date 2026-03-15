import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBillingDashboard } from '@/data/billing'

export async function GET(request: Request) {
    const supabase = await createClient()

    // Authentication check
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const yearStr = searchParams.get('year')
    const monthStr = searchParams.get('month')

    if (!yearStr || !monthStr) {
        return NextResponse.json({ error: 'Faltan parámetros year o month' }, { status: 400 })
    }

    const year = parseInt(yearStr)
    const month = parseInt(monthStr)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    try {
        // Resolve coachId from coaches table (coaches.created_by = auth.uid)
        const { data: coachData } = await supabase
            .from('coaches')
            .select('id')
            .eq('created_by', user.id)
            .single()

        if (!coachData) {
            // Fallback: try coach_memberships
            const { data: membership } = await supabase
                .from('coach_memberships')
                .select('coach_id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .single()

            if (!membership) {
                return NextResponse.json({ error: 'No eres coach activo' }, { status: 403 })
            }

            const data = await getBillingDashboard(membership.coach_id, year, month)
            return NextResponse.json({ data })
        }

        const data = await getBillingDashboard(coachData.id, year, month)
        return NextResponse.json({ data })
    } catch (error: any) {
        console.error('Error fetching billing data:', error)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}
