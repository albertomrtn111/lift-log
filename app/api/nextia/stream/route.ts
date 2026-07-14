import { NextRequest } from 'next/server'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { buildNextIAAthleteContext } from '@/lib/ai/nextia-athlete-context'
import { buildNextIAPrompt } from '@/lib/ai/nextia-prompt'
import { streamGemini } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Chat NextIA en streaming: la respuesta se ve escribirse en vez de esperar
 * al bloque completo. El mensaje del assistant se persiste al terminar.
 */
export async function POST(request: NextRequest) {
    let supabase, coachId: string
    try {
        ;({ supabase, coachId } = await requireActiveCoachId())
    } catch {
        return new Response('No autorizado', { status: 401 })
    }

    let body: { clientId?: string; content?: string }
    try {
        body = await request.json()
    } catch {
        return new Response('Body inválido', { status: 400 })
    }

    const clientId = body.clientId
    const content = body.content?.trim()
    if (!clientId || !content || content.length > 4000) {
        return new Response('Mensaje vacío o demasiado largo (máx 4000 caracteres).', { status: 400 })
    }

    // El coach debe tener acceso al atleta
    const { data: clientRow } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (!clientRow) {
        return new Response('No tienes acceso a este atleta.', { status: 403 })
    }

    try {
        // Insert del mensaje del coach + historial + contexto EN PARALELO
        // (antes eran pasos secuenciales)
        const [insertResult, recentResult] = await Promise.all([
            supabase.from('nextia_chat_messages').insert({
                coach_id: coachId,
                client_id: clientId,
                role: 'user',
                content,
            }),
            supabase
                .from('nextia_chat_messages')
                .select('role, content, created_at')
                .eq('coach_id', coachId)
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })
                .limit(12),
        ])

        if (insertResult.error) throw new Error(insertResult.error.message)

        const recentMessages = ((recentResult.data || []) as Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>)
            .reverse()

        const athleteContext = await buildNextIAAthleteContext({
            coachId,
            clientId,
            recentMessages: [...recentMessages, { role: 'user', content, created_at: new Date().toISOString() }],
        })

        const geminiStream = await streamGemini(buildNextIAPrompt(content, athleteContext), {
            temperature: 0.4,
            maxOutputTokens: 2048,
            thinkingBudget: 0,
        })

        // Acumular el texto completo mientras se emite, y persistir al terminar
        let fullAnswer = ''
        const encoder = new TextEncoder()
        const admin = createAdminClient()

        const outStream = geminiStream.pipeThrough(new TransformStream<string, Uint8Array>({
            transform(chunk, controller) {
                fullAnswer += chunk
                controller.enqueue(encoder.encode(chunk))
            },
            async flush() {
                const answer = fullAnswer.trim()
                if (!answer) return
                const { error } = await admin
                    .from('nextia_chat_messages')
                    .insert({
                        coach_id: coachId,
                        client_id: clientId,
                        role: 'assistant',
                        content: answer,
                    })
                if (error) {
                    console.error('[nextia/stream] No se pudo persistir la respuesta:', error.message)
                }
            },
        }))

        return new Response(outStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar la respuesta de NextIA.'
        console.error('[nextia/stream]', message)
        return new Response(message, { status: 500 })
    }
}
