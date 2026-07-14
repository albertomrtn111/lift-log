'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { buildNextIAAthleteContext } from '@/lib/ai/nextia-athlete-context'
import { buildNextIAPrompt } from '@/lib/ai/nextia-prompt'
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
            maxOutputTokens: 2048,
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
        return { success: true, messages }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar la respuesta de NextIA.'
        console.error('[NextIA] send error:', message)
        return { success: false, error: message }
    }
}
