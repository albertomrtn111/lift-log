import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateCheckinAnalysis } from '@/lib/ai/analyze-checkin'
import { createClient } from '@/lib/supabase/server'

const RequestSchema = z.object({
    checkinId: z.string().uuid(),
    reviewId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Parámetros inválidos' }, { status: 400 })
    }

    const { data: review, error: reviewError } = await supabase
        .from('reviews')
        .select('id')
        .eq('id', parsed.data.reviewId)
        .eq('checkin_id', parsed.data.checkinId)
        .single()

    if (reviewError || !review) {
        return NextResponse.json({ success: false, error: 'Sin permisos para esta revisión' }, { status: 403 })
    }

    const result = await generateCheckinAnalysis(parsed.data.checkinId, parsed.data.reviewId)

    if (!result.success) {
        return NextResponse.json(result, { status: 500 })
    }

    return NextResponse.json(result)
}
