import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import {
    getAthleteAIProfile,
    markAthleteProfileOnboardingComplete,
    saveAthleteGenerationError,
    saveGeneratedAthleteProfile,
} from '@/data/athlete-ai-profile'
import { generateAthleteAIProfile } from '@/lib/ai/generate-athlete-profile'

export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
    }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) {
        return NextResponse.json({ success: false, error: 'Sin acceso de coach' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const clientId = typeof body?.clientId === 'string' ? body.clientId : null

    if (!clientId) {
        return NextResponse.json({ success: false, error: 'Falta el cliente.' }, { status: 400 })
    }

    const profile = await getAthleteAIProfile(coachId, clientId)
    if (!profile) {
        return NextResponse.json({ success: false, error: 'Perfil del atleta no encontrado.' }, { status: 404 })
    }

    await markAthleteProfileOnboardingComplete(coachId, clientId)

    const result = await generateAthleteAIProfile(coachId, profile)

    if (!result.success) {
        await saveAthleteGenerationError(coachId, clientId, result.error)
        return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    const saved = await saveGeneratedAthleteProfile(coachId, clientId, result.output)
    if (!saved.success) {
        return NextResponse.json({ success: false, error: saved.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, output: result.output })
}
