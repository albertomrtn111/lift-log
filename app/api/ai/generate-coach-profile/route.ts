import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import {
    getCoachAIProfile,
    markOnboardingComplete,
    saveGeneratedProfile,
    saveGenerationError,
} from '@/data/coach-ai-profile'
import { generateCoachAIProfile } from '@/lib/ai/generate-coach-profile'

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

    // Load the current onboarding data
    const profile = await getCoachAIProfile(coachId)
    if (!profile) {
        return NextResponse.json({ success: false, error: 'Perfil no encontrado. Completa el onboarding primero.' }, { status: 404 })
    }

    // Mark as generating (before async work)
    await markOnboardingComplete(coachId)

    // Call AI
    const result = await generateCoachAIProfile(profile)

    if (!result.success) {
        await saveGenerationError(coachId, result.error)
        return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    const { output } = result

    // Persist generated profile
    const saved = await saveGeneratedProfile(coachId, {
        generated_profile_summary: output.professional_summary,
        generated_methodology: output.methodology,
        generated_communication_style: output.communication_style,
        generated_master_rules: output.master_rules,
        generated_system_prompt: output.system_prompt,
        generated_profile_json: output as Record<string, unknown>,
    })

    if (!saved.success) {
        return NextResponse.json({ success: false, error: saved.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, output })
}
