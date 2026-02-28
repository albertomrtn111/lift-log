/**
 * n8n Webhook helper — server-side only.
 *
 * All n8n calls go through this module so credentials stay in env vars
 * and never leak to the client bundle.
 */

// ---------------------------------------------------------------------------
// Config (read from env — never import this file in client components)
// ---------------------------------------------------------------------------

const N8N_ONBOARDING_URL =
    process.env.N8N_ONBOARDING_WEBHOOK_URL ||
    'https://n8n.ascenttech.cloud/webhook/send-onboarding'

const N8N_INVITE_URL =
    process.env.N8N_INVITE_WEBHOOK_URL ||
    'https://n8n.ascenttech.cloud/webhook/invite-client'

const N8N_USER = process.env.N8N_BASIC_AUTH_USER || ''
const N8N_PASS = process.env.N8N_BASIC_AUTH_PASS || ''

function basicAuthHeader(): string {
    const encoded = Buffer.from(`${N8N_USER}:${N8N_PASS}`).toString('base64')
    return `Basic ${encoded}`
}

// ---------------------------------------------------------------------------
// Generic caller
// ---------------------------------------------------------------------------

interface N8nResult {
    ok: boolean
    status?: number
    error?: string
}

async function callN8n(url: string, body: Record<string, unknown>): Promise<N8nResult> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    // Add Basic Auth only if credentials are configured
    if (N8N_USER && N8N_PASS) {
        headers['Authorization'] = basicAuthHeader()
    }

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000) // 15s timeout

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!response.ok) {
            const text = await response.text().catch(() => '')
            console.error(`[n8n] ❌ ${url} responded ${response.status}: ${text}`)
            return { ok: false, status: response.status, error: `n8n error (${response.status})` }
        }

        console.log(`[n8n] ✅ ${url} → ${response.status}`)
        return { ok: true, status: response.status }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.error(`[n8n] ⏰ Timeout calling ${url}`)
            return { ok: false, error: 'n8n webhook timeout (15s)' }
        }
        console.error(`[n8n] ❌ Exception calling ${url}:`, err.message)
        return { ok: false, error: err.message }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendOnboardingEmail(params: {
    clientId: string
    coachId: string
    clientEmail?: string
    clientName?: string
    checkinId?: string
    formTemplateId?: string
    formUrl?: string
}): Promise<N8nResult> {
    console.log(`[n8n] Sending onboarding for client=${params.clientId} coach=${params.coachId}`)

    return callN8n(N8N_ONBOARDING_URL, {
        client_id: params.clientId,
        coach_id: params.coachId,
        client_email: params.clientEmail,
        client_name: params.clientName,
        checkin_id: params.checkinId,
        form_template_id: params.formTemplateId,
        form_url: params.formUrl,
    })
}

export async function sendInviteEmail(params: {
    clientId: string
    coachId: string
    clientEmail: string
    clientName: string
}): Promise<N8nResult> {
    console.log(`[n8n] Sending invite for client=${params.clientId} coach=${params.coachId}`)

    return callN8n(N8N_INVITE_URL, {
        client_id: params.clientId,
        coach_id: params.coachId,
        client_email: params.clientEmail,
        client_name: params.clientName,
    })
}
