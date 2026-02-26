'use server'

import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const N8N_WEBHOOK_URL = 'https://n8n.ascenttech.cloud/webhook/send-onboarding'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SendOnboardingResult {
    success: boolean
    checkin_id?: string
    form_url?: string
    reused?: boolean
    error?: string
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function getAuthCoachId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { supabase, coachId: null as string | null }
    const coachId = await getCoachIdForUser(user.id)
    return { supabase, coachId }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function sendOnboardingAction(
    clientId: string,
    coachId: string
): Promise<SendOnboardingResult> {
    const { supabase, coachId: authCoachId } = await getAuthCoachId()

    // 1. Auth check
    if (!authCoachId || authCoachId !== coachId) {
        return { success: false, error: 'No autorizado' }
    }

    // 2. Verify coach owns this client & client has account
    const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, email, full_name, auth_user_id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .single()

    if (clientErr || !client) {
        return { success: false, error: 'Cliente no encontrado' }
    }

    if (!client.auth_user_id) {
        return { success: false, error: 'El cliente debe registrarse antes de recibir formularios' }
    }

    // 3. Find default onboarding template
    const { data: template, error: tplErr } = await supabase
        .from('form_templates')
        .select('id')
        .eq('coach_id', coachId)
        .eq('type', 'onboarding')
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .single()

    if (tplErr || !template) {
        return {
            success: false,
            error: 'No tienes una plantilla default de onboarding. Crea una en Formularios y márcala como default.',
        }
    }

    // 4. Check for existing pending onboarding (last 14 days)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const { data: existing } = await supabase
        .from('checkins')
        .select('id')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .eq('type', 'onboarding')
        .eq('status', 'pending')
        .gte('created_at', fourteenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)

    let checkinId: string
    let reused = false

    if (existing && existing.length > 0) {
        checkinId = existing[0].id
        reused = true
    } else {
        // 5. Insert new onboarding checkin
        const { data: newCheckin, error: insertErr } = await supabase
            .from('checkins')
            .insert({
                coach_id: coachId,
                client_id: clientId,
                type: 'onboarding',
                status: 'pending',
                form_template_id: template.id,
                source: 'coach_portal',
                raw_payload: {},
            })
            .select('id')
            .single()

        if (insertErr || !newCheckin) {
            console.error('[sendOnboardingAction] Insert error:', insertErr)
            return { success: false, error: insertErr?.message || 'Error al crear el onboarding' }
        }

        checkinId = newCheckin.id
    }

    // 6. Build form URL
    const formUrl = `${BASE_URL}/forms/onboarding?checkin_id=${checkinId}`

    // 7. Fire-and-forget n8n webhook (best-effort)
    try {
        await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: client.id,
                client_email: client.email,
                client_name: client.full_name,
                coach_id: coachId,
                checkin_id: checkinId,
                form_template_id: template.id,
                form_url: formUrl,
            }),
        })
    } catch (err) {
        // Webhook failure is non-blocking — coach can still share the link manually
        console.warn('[sendOnboardingAction] Webhook call failed (non-blocking):', err)
    }

    revalidatePath('/coach/members')

    return {
        success: true,
        checkin_id: checkinId,
        form_url: formUrl,
        reused,
    }
}
