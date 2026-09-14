import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAIClient } from '@/lib/ai/access'
import {
    getAthleteAIProfile,
    markAthleteProfileOnboardingComplete,
    saveAthleteGenerationError,
    saveGeneratedAthleteProfile,
} from '@/data/athlete-ai-profile'
import { generateAthleteAIProfile } from '@/lib/ai/generate-athlete-profile'

const RequestSchema = z.object({
    clientId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null)
    const parsed = RequestSchema.safeParse(body)

    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Cliente inválido.' }, { status: 400 })
    }

    const clientId = parsed.data.clientId
    let coachId: string
    try {
        ;({ coachId } = await requireAIClient(clientId))
    } catch {
        return NextResponse.json({ success: false, error: 'Sin acceso a este atleta.' }, { status: 403 })
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
