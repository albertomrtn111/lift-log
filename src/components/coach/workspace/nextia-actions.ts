'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { buildNextIAAthleteContext } from '@/lib/ai/nextia-athlete-context'
import { callGemini } from '@/lib/ai/gemini'

export type NextIAChatMessage = {
    id: string
    coach_id: string
    client_id: string
    role: 'user' | 'assistant'
    content: string
    context_version: string
    created_at: string
}

type SendNextIAMessageInput = {
    coachId: string
    clientId: string
    content: string
}

async function assertCoachCanAccessClient(supabase: any, coachId: string, clientId: string) {
    const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('No tienes acceso a este atleta.')
}

function isMissingNextIATableError(error: unknown) {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ((error as { code?: string }).code === 'PGRST205' || (error as { code?: string }).code === '42P01')
    )
}

function getMissingNextIATableMessage() {
    return 'Falta aplicar la tabla nextia_chat_messages en Supabase. Ejecuta sql/create_nextia_chat_messages.sql en el SQL editor y vuelve a abrir el workspace.'
}

export async function getNextIAMessagesAction(
    coachIdFromClient: string,
    clientId: string
): Promise<NextIAChatMessage[]> {
    const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)
    await assertCoachCanAccessClient(supabase, coachId, clientId)

    const { data, error } = await supabase
        .from('nextia_chat_messages')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .limit(80)

    if (error) {
        if (isMissingNextIATableError(error)) {
            console.error('[NextIA] Missing table:', error)
            return []
        }
        console.error('[NextIA] Error loading messages:', error)
        return []
    }

    return (data || []) as NextIAChatMessage[]
}

function buildNextIAPrompt(userMessage: string, athleteContext: string) {
    return `Eres NextIA, un asistente privado para coaches de entrenamiento.

Tu objetivo es ayudar al coach a tomar mejores decisiones sobre este atleta usando el contexto disponible.

Reglas:
- Responde siempre en español.
- Sé concreto, accionable y prudente.
- No inventes datos que no aparezcan en el contexto.
- Si falta información, dilo y sugiere qué revisar.
- No escribas como si hablaras directamente al atleta, salvo que el coach te pida redactar un mensaje.
- Prioriza salud, fatiga, eventos cercanos, adherencia y coherencia entre fuerza/cardio/progreso.
- Mantén la respuesta normalmente entre 4 y 10 bullets o 2-5 párrafos cortos.

# Contexto del atleta
${athleteContext}

# Pregunta del coach
${userMessage}`
}

export async function sendNextIAMessageAction(input: SendNextIAMessageInput): Promise<{
    success: boolean
    messages?: NextIAChatMessage[]
    error?: string
}> {
    try {
        const { supabase, coachId } = await requireActiveCoachId(input.coachId)
        await assertCoachCanAccessClient(supabase, coachId, input.clientId)

        const content = input.content.trim()
        if (!content || content.length > 4000) {
            return { success: false, error: 'Mensaje vacio o demasiado largo (max 4000 caracteres).' }
        }

        const { error: insertError } = await supabase
            .from('nextia_chat_messages')
            .insert({
                coach_id: coachId,
                client_id: input.clientId,
                role: 'user',
                content,
            })

        if (insertError) {
            if (isMissingNextIATableError(insertError)) {
                return { success: false, error: getMissingNextIATableMessage() }
            }
            throw new Error(insertError.message)
        }

        const { data: recentRows, error: recentError } = await supabase
            .from('nextia_chat_messages')
            .select('role, content, created_at')
            .eq('coach_id', coachId)
            .eq('client_id', input.clientId)
            .order('created_at', { ascending: false })
            .limit(12)

        if (recentError) {
            if (isMissingNextIATableError(recentError)) {
                return { success: false, error: getMissingNextIATableMessage() }
            }
            throw new Error(recentError.message)
        }

        const athleteContext = await buildNextIAAthleteContext({
            coachId,
            clientId: input.clientId,
            recentMessages: ((recentRows || []) as Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>).reverse(),
        })

        const rawAnswer = await callGemini(buildNextIAPrompt(content, athleteContext), {
            temperature: 0.4,
            maxOutputTokens: 4096,
            thinkingBudget: 0,
        })

        const answer = rawAnswer.trim()
        if (!answer) throw new Error('NextIA no devolvio contenido.')

        const { error: answerError } = await supabase
            .from('nextia_chat_messages')
            .insert({
                coach_id: coachId,
                client_id: input.clientId,
                role: 'assistant',
                content: answer,
            })

        if (answerError) {
            if (isMissingNextIATableError(answerError)) {
                return { success: false, error: getMissingNextIATableMessage() }
            }
            throw new Error(answerError.message)
        }

        const messages = await getNextIAMessagesAction(coachId, input.clientId)
        revalidatePath('/coach/clients')
        return { success: true, messages }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar la respuesta de NextIA.'
        console.error('[NextIA] send error:', message)
        return { success: false, error: message }
    }
}
