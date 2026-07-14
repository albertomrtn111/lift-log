'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { callGemini } from '@/lib/ai/gemini'
import { buildCoachAssistantContext } from '@/lib/ai/coach-assistant-context'

export type CoachAssistantMessage = {
    id: string
    coach_id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
}

const HISTORY_LIMIT = 60
const PROMPT_HISTORY_LIMIT = 12

function buildAssistantPrompt(
    question: string,
    context: string,
    history: { role: 'user' | 'assistant'; content: string }[]
): string {
    const historyBlock = history.length > 0
        ? history
            .map(m => `${m.role === 'user' ? 'Coach' : 'Asistente'}: ${m.content.slice(0, 1500)}`)
            .join('\n\n')
        : '(sin mensajes anteriores)'

    return `Eres el asistente IA del portal de coaches de NexTrain. Ayudas al coach a gestionar a sus atletas: responder dudas sobre su estado, priorizar el trabajo, preparar revisiones y razonar decisiones de entrenamiento y nutrición.

Reglas estrictas:
- Eres SOLO de consulta: no puedes crear, editar ni enviar nada. Si el coach te pide ejecutar una acción, explica cómo hacerlo en la app (workspace, calendario, formularios, ajustes…), pero deja claro que la hace él.
- Responde siempre en español, de forma concreta y accionable.
- Básate únicamente en los datos del contexto. No inventes valores. Si un dato no está, dilo y sugiere dónde mirar.
- Si preguntan por un atleta concreto y su bloque "Detalle completo" no está en el contexto, di que puedes dar más detalle si escriben su nombre completo.
- Formato: párrafos cortos o bullets. Usa **negrita** para nombres y datos clave. Normalmente 3-8 bullets o 2-4 párrafos.

# Datos del coach (contexto en vivo)
${context}

# Conversación reciente
${historyBlock}

# Pregunta actual del coach
${question}`
}

export async function getCoachAssistantMessagesAction(): Promise<CoachAssistantMessage[]> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const { data, error } = await supabase
            .from('coach_assistant_messages')
            .select('*')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: true })
            .limit(HISTORY_LIMIT)

        if (error) {
            console.error('[coach-assistant] Error loading messages:', error)
            return []
        }
        return (data ?? []) as CoachAssistantMessage[]
    } catch {
        return []
    }
}

export async function sendCoachAssistantMessageAction(content: string): Promise<{
    success: boolean
    messages?: CoachAssistantMessage[]
    error?: string
}> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()

        const question = content.trim()
        if (!question || question.length > 4000) {
            return { success: false, error: 'Mensaje vacío o demasiado largo (máx 4000 caracteres).' }
        }

        const { error: insertError } = await supabase
            .from('coach_assistant_messages')
            .insert({ coach_id: coachId, role: 'user', content: question })

        if (insertError) throw new Error(insertError.message)

        // Historial reciente para dar continuidad a la conversación
        const { data: recentRows } = await supabase
            .from('coach_assistant_messages')
            .select('role, content')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false })
            .limit(PROMPT_HISTORY_LIMIT)

        const history = ((recentRows ?? []) as { role: 'user' | 'assistant'; content: string }[])
            .reverse()
            // El último es la pregunta actual, que ya va aparte en el prompt
            .slice(0, -1)

        const context = await buildCoachAssistantContext(coachId, question)

        const rawAnswer = await callGemini(buildAssistantPrompt(question, context, history), {
            temperature: 0.4,
            maxOutputTokens: 2048,
            thinkingBudget: 0,
        })

        const answer = rawAnswer.trim()
        if (!answer) throw new Error('El asistente no devolvió contenido.')

        const { error: answerError } = await supabase
            .from('coach_assistant_messages')
            .insert({ coach_id: coachId, role: 'assistant', content: answer })

        if (answerError) throw new Error(answerError.message)

        const messages = await getCoachAssistantMessagesAction()
        return { success: true, messages }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar la respuesta.'
        console.error('[coach-assistant] send error:', message)
        return { success: false, error: message }
    }
}

export async function clearCoachAssistantChatAction(): Promise<{ success: boolean; error?: string }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const { error } = await supabase
            .from('coach_assistant_messages')
            .delete()
            .eq('coach_id', coachId)

        if (error) throw new Error(error.message)
        return { success: true }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo borrar la conversación.',
        }
    }
}
