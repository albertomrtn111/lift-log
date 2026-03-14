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

    // Verify coach role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'coach') {
        return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
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
        const data = await getBillingDashboard(user.id, year, month)
        return NextResponse.json({ data })
    } catch (error: any) {
        console.error('Error fetching billing data:', error)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}
