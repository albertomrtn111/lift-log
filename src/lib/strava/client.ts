import 'server-only'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAppUrl } from '@/lib/app-url'
import { getUserContext } from '@/lib/auth/get-user-context'
import { sendPushToClient } from '@/lib/push'

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_URL = 'https://www.strava.com/api/v3'
const STATE_COOKIE_NAME = 'strava_oauth_nonce'
const STATE_TTL_SECONDS = 10 * 60
const TOKEN_REFRESH_SKEW_SECONDS = 5 * 60

export type StravaIntegrationStatus = 'connected' | 'disconnected' | 'error' | 'revoked'

export interface AuthenticatedClientContext {
    userId: string
    clientId: string
    coachId: string
}

export interface StravaWebhookEvent {
    object_type: 'activity' | 'athlete'
    object_id: number
    aspect_type: 'create' | 'update' | 'delete'
    owner_id: number
    event_time?: number
    subscription_id?: number
    updates?: Record<string, string>
}

interface StravaEnv {
    clientId: string
    clientSecret: string
    verifyToken: string
    redirectUri: string
    appUrl: string
}

interface StravaTokenResponse {
    token_type: string
    access_token: string
    refresh_token: string
    expires_at: number
    expires_in: number
    scope?: string
    athlete?: {
        id: number
    }
}

interface StravaActivityPayload {
    id: number
    athlete?: { id: number }
    name?: string
    type?: string
    sport_type?: string
    start_date?: string
    start_date_local?: string
    distance?: number
    moving_time?: number
    elapsed_time?: number
    average_speed?: number
    average_heartrate?: number
    max_heartrate?: number
    total_elevation_gain?: number
    calories?: number
}

export function getStravaEnv(): StravaEnv {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || getAppUrl()
    const redirectUri = process.env.STRAVA_REDIRECT_URI?.trim() || `${appUrl}/api/strava/callback`
    const env = {
        clientId: process.env.STRAVA_CLIENT_ID?.trim() || '',
        clientSecret: process.env.STRAVA_CLIENT_SECRET?.trim() || '',
        verifyToken: process.env.STRAVA_VERIFY_TOKEN?.trim() || '',
        redirectUri,
        appUrl,
    }

    const missing = [
        ['STRAVA_CLIENT_ID', env.clientId],
        ['STRAVA_CLIENT_SECRET', env.clientSecret],
        ['STRAVA_VERIFY_TOKEN', env.verifyToken],
        ['NEXT_PUBLIC_APP_URL', env.appUrl],
    ].filter(([, value]) => !value)

    if (missing.length > 0) {
        throw new Error(`Missing Strava environment variables: ${missing.map(([key]) => key).join(', ')}`)
    }

    return env
}

export async function getAuthenticatedClientContext(): Promise<AuthenticatedClientContext | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const context = await getUserContext(user.id)
    if (!context.isClient || !context.clientId || !context.clientCoachId) return null

    return {
        userId: user.id,
        clientId: context.clientId,
        coachId: context.clientCoachId,
    }
}

function base64url(value: string) {
    return Buffer.from(value).toString('base64url')
}

function signStatePayload(payload: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createOAuthState(context: AuthenticatedClientContext) {
    const env = getStravaEnv()
    const nonce = crypto.randomBytes(24).toString('base64url')
    const payload = base64url(JSON.stringify({
        userId: context.userId,
        clientId: context.clientId,
        coachId: context.coachId,
        nonce,
        exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    }))
    const signature = signStatePayload(payload, env.clientSecret)

    return {
        nonce,
        state: `${payload}.${signature}`,
        cookieName: STATE_COOKIE_NAME,
        maxAge: STATE_TTL_SECONDS,
    }
}

export function verifyOAuthState(state: string | null, cookieNonce: string | undefined, currentUserId: string) {
    const env = getStravaEnv()
    if (!state || !cookieNonce) throw new Error('Invalid OAuth state')

    const [payload, signature] = state.split('.')
    if (!payload || !signature) throw new Error('Invalid OAuth state')

    const expectedSignature = signStatePayload(payload, env.clientSecret)
    const signatureBuffer = Buffer.from(signature)
    const expectedSignatureBuffer = Buffer.from(expectedSignature)
    const validSignature = signatureBuffer.length === expectedSignatureBuffer.length
        && crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    if (!validSignature) throw new Error('Invalid OAuth state signature')

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthenticatedClientContext & {
        nonce: string
        exp: number
    }

    if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('OAuth state expired')
    if (decoded.nonce !== cookieNonce) throw new Error('OAuth nonce mismatch')
    if (decoded.userId !== currentUserId) throw new Error('OAuth user mismatch')

    return decoded
}

export function buildStravaAuthorizeUrl(state: string) {
    const env = getStravaEnv()
    const url = new URL(STRAVA_AUTH_URL)
    url.searchParams.set('client_id', env.clientId)
    url.searchParams.set('redirect_uri', env.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('approval_prompt', 'auto')
    url.searchParams.set('scope', 'read,activity:read_all')
    url.searchParams.set('state', state)
    return url
}

async function postStravaToken(params: Record<string, string>): Promise<StravaTokenResponse> {
    const env = getStravaEnv()
    const body = new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        ...params,
    })

    const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        cache: 'no-store',
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Strava token request failed (${response.status}): ${errorBody}`)
    }

    return response.json()
}

export async function exchangeCodeForTokens(code: string) {
    return postStravaToken({
        code,
        grant_type: 'authorization_code',
    })
}

function toIsoFromEpochSeconds(seconds: number | null | undefined) {
    if (!seconds) return null
    return new Date(seconds * 1000).toISOString()
}

export async function saveStravaIntegration(params: {
    context: AuthenticatedClientContext
    tokenResponse: StravaTokenResponse
    scope: string | null
}) {
    const athleteId = params.tokenResponse.athlete?.id
    if (!athleteId) throw new Error('Strava token response did not include athlete id')

    const supabase = createAdminClient()
    const { error } = await supabase
        .from('athlete_integrations')
        .upsert({
            client_id: params.context.clientId,
            coach_id: params.context.coachId,
            provider: 'strava',
            provider_athlete_id: String(athleteId),
            access_token: params.tokenResponse.access_token,
            refresh_token: params.tokenResponse.refresh_token,
            expires_at: toIsoFromEpochSeconds(params.tokenResponse.expires_at),
            scope: params.scope,
            status: 'connected',
            error_message: null,
            connected_at: new Date().toISOString(),
        }, { onConflict: 'client_id,provider' })

    if (error) throw new Error(error.message)
}

export async function getStravaStatus(context: AuthenticatedClientContext) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('athlete_integrations')
        .select('provider, provider_athlete_id, status, scope, connected_at, last_sync_at, error_message, updated_at')
        .eq('client_id', context.clientId)
        .eq('provider', 'strava')
        .maybeSingle()

    if (error) throw new Error(error.message)
    return data
}

export async function disconnectStrava(context: AuthenticatedClientContext) {
    const supabase = createAdminClient()
    const integration = await getIntegrationForClient(context.clientId)

    if (integration?.access_token) {
        await fetch(`${STRAVA_TOKEN_URL.replace('/token', '/deauthorize')}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ access_token: integration.access_token }),
            cache: 'no-store',
        }).catch(() => null)
    }

    const { error } = await supabase
        .from('athlete_integrations')
        .update({
            status: 'disconnected',
            access_token: null,
            refresh_token: null,
            expires_at: null,
            error_message: null,
        })
        .eq('client_id', context.clientId)
        .eq('provider', 'strava')

    if (error) throw new Error(error.message)
}

async function getIntegrationForClient(clientId: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('athlete_integrations')
        .select('*')
        .eq('client_id', clientId)
        .eq('provider', 'strava')
        .maybeSingle()

    if (error) throw new Error(error.message)
    return data
}

export async function getValidStravaAccessToken(clientId: string) {
    const supabase = createAdminClient()
    const integration = await getIntegrationForClient(clientId)

    if (!integration || integration.status !== 'connected') {
        throw new Error('Activity connector is not connected for this client')
    }

    if (!integration.access_token || !integration.refresh_token) {
        throw new Error('Activity connector tokens are missing')
    }

    const expiresAtMs = integration.expires_at ? new Date(integration.expires_at).getTime() : 0
    const shouldRefresh = expiresAtMs <= Date.now() + TOKEN_REFRESH_SKEW_SECONDS * 1000
    if (!shouldRefresh) return integration.access_token as string

    const refreshed = await postStravaToken({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
    })

    const { error } = await supabase
        .from('athlete_integrations')
        .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: toIsoFromEpochSeconds(refreshed.expires_at),
            status: 'connected',
            error_message: null,
        })
        .eq('id', integration.id)

    if (error) throw new Error(error.message)
    return refreshed.access_token
}

async function fetchStravaApi<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${STRAVA_API_URL}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Strava API request failed (${response.status}): ${errorBody}`)
    }

    return response.json()
}

function averagePaceSecondsPerKm(activity: StravaActivityPayload) {
    const distance = Number(activity.distance ?? 0)
    const movingTime = Number(activity.moving_time ?? 0)
    if (distance <= 0 || movingTime <= 0) return null
    return movingTime / (distance / 1000)
}

function formatPace(secondsPerKm: number | null) {
    if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return null
    const minutes = Math.floor(secondsPerKm / 60)
    const seconds = Math.round(secondsPerKm % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}/km`
}

function mapStravaSportToDiscipline(activity: StravaActivityPayload) {
    const sport = (activity.sport_type || activity.type || '').toLowerCase()
    if (sport.includes('ride') || sport.includes('bike') || sport.includes('cycling')) return 'Bicicleta'
    if (sport.includes('swim')) return 'Natación'
    if (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) return 'Running'
    return 'Running'
}

function getLocalDate(activity: StravaActivityPayload) {
    const source = activity.start_date_local || activity.start_date
    return source ? source.slice(0, 10) : new Date().toISOString().slice(0, 10)
}

function addDays(date: string, days: number) {
    const d = new Date(`${date}T12:00:00`)
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
}

function compatibleActivity(session: any, activity: StravaActivityPayload) {
    const discipline = mapStravaSportToDiscipline(activity).toLowerCase()
    const haystack = [
        session.activity_type,
        session.training_type,
        session.name,
        session.structure?.trainingType,
    ].filter(Boolean).join(' ').toLowerCase()

    if (!haystack) return true
    if (discipline.includes('running')) return /run|running|carrera|rodaje|series|tempo|fartlek/.test(haystack)
    if (discipline.includes('bicicleta')) return /bike|bici|bicicleta|cycling|ciclismo/.test(haystack)
    if (discipline.includes('natación')) return /swim|nataci|natación/.test(haystack)
    return false
}

async function findPlannedCardioSessionMatch(clientId: string, activity: StravaActivityPayload) {
    const supabase = createAdminClient()
    const localDate = getLocalDate(activity)
    const { data, error } = await supabase
        .from('cardio_sessions')
        .select('id, scheduled_date, activity_type, training_type, name, structure, target_distance_km, target_duration_min, is_completed, source_provider')
        .eq('client_id', clientId)
        .eq('is_completed', false)
        .gte('scheduled_date', addDays(localDate, -1))
        .lte('scheduled_date', addDays(localDate, 1))

    if (error) throw new Error(error.message)
    const candidates = (data || []).filter((session: any) => !session.source_provider && compatibleActivity(session, activity))
    if (candidates.length === 0) return null

    const distanceKm = Number(activity.distance ?? 0) / 1000
    const durationMin = Number(activity.moving_time ?? 0) / 60

    const scored = candidates.map((session: any) => {
        let score = session.scheduled_date === localDate ? 4 : 2
        const targetDistance = session.target_distance_km ? Number(session.target_distance_km) : null
        const targetDuration = session.target_duration_min ? Number(session.target_duration_min) : null

        if (targetDistance && distanceKm > 0) {
            const ratio = Math.abs(distanceKm - targetDistance) / targetDistance
            if (ratio <= 0.2) score += 3
            else if (ratio <= 0.35) score += 1
            else score -= 2
        }

        if (targetDuration && durationMin > 0) {
            const ratio = Math.abs(durationMin - targetDuration) / targetDuration
            if (ratio <= 0.2) score += 3
            else if (ratio <= 0.35) score += 1
            else score -= 2
        }

        return { session, score }
    }).sort((a, b) => b.score - a.score)

    if (scored[0]?.score >= 4 && (!scored[1] || scored[0].score - scored[1].score >= 2)) {
        return scored[0].session.id as string
    }

    return null
}

async function upsertImportedActivity(clientId: string, coachId: string, activity: StravaActivityPayload) {
    const supabase = createAdminClient()
    const paceSeconds = averagePaceSecondsPerKm(activity)
    const matchedSessionId = await findPlannedCardioSessionMatch(clientId, activity)
    const providerActivityId = String(activity.id)
    const stravaAthleteId = String(activity.athlete?.id ?? '')

    const { data, error } = await supabase
        .from('strava_activities')
        .upsert({
            client_id: clientId,
            coach_id: coachId,
            provider: 'strava',
            provider_activity_id: providerActivityId,
            strava_athlete_id: stravaAthleteId,
            name: activity.name ?? 'Actividad importada',
            activity_type: activity.type ?? null,
            sport_type: activity.sport_type ?? null,
            start_date: activity.start_date ?? null,
            start_date_local: activity.start_date_local ?? null,
            distance_meters: activity.distance ?? null,
            moving_time_seconds: activity.moving_time ?? null,
            elapsed_time_seconds: activity.elapsed_time ?? null,
            average_speed: activity.average_speed ?? null,
            average_pace_seconds_per_km: paceSeconds,
            average_heartrate: activity.average_heartrate ?? null,
            max_heartrate: activity.max_heartrate ?? null,
            total_elevation_gain: activity.total_elevation_gain ?? null,
            calories: activity.calories ?? null,
            raw_payload: activity,
            matched_planned_session_id: matchedSessionId,
            is_deleted: false,
            imported_at: new Date().toISOString(),
        }, { onConflict: 'provider,provider_activity_id' })
        .select('id')
        .single()

    if (error) throw new Error(error.message)
    return data
}

export async function importStravaActivityForIntegration(integration: any, activityId: number) {
    const accessToken = await getValidStravaAccessToken(integration.client_id)
    const activity = await fetchStravaApi<StravaActivityPayload>(`/activities/${activityId}`, accessToken)
    const imported = await upsertImportedActivity(integration.client_id, integration.coach_id, activity)
    return { imported, activity }
}

export async function syncRecentStravaActivities(context: AuthenticatedClientContext, perPage = 20) {
    const supabase = createAdminClient()
    const integration = await getIntegrationForClient(context.clientId)
    if (!integration || integration.status !== 'connected') throw new Error('Activity connector is not connected')

    const accessToken = await getValidStravaAccessToken(context.clientId)
    const activities = await fetchStravaApi<StravaActivityPayload[]>(
        `/athlete/activities?per_page=${Math.max(1, Math.min(perPage, 50))}`,
        accessToken
    )

    let imported = 0
    for (const summary of activities) {
        const detail = await fetchStravaApi<StravaActivityPayload>(`/activities/${summary.id}`, accessToken)
        await upsertImportedActivity(context.clientId, context.coachId, detail)
        imported += 1
    }

    const { error } = await supabase
        .from('athlete_integrations')
        .update({ last_sync_at: new Date().toISOString(), status: 'connected', error_message: null })
        .eq('id', integration.id)

    if (error) throw new Error(error.message)
    return { imported }
}

export async function getPendingStravaActivities(context: AuthenticatedClientContext) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('strava_activities')
        .select('id, name, activity_type, sport_type, start_date_local, distance_meters, moving_time_seconds, average_pace_seconds_per_km, average_heartrate, max_heartrate')
        .eq('client_id', context.clientId)
        .eq('feedback_status', 'pending')
        .eq('is_deleted', false)
        .order('start_date_local', { ascending: false })
        .limit(5)

    if (error) throw new Error(error.message)
    return data || []
}

async function completeCardioSessionForActivity(activity: any) {
    const supabase = createAdminClient()
    const pace = formatPace(activity.average_pace_seconds_per_km ? Number(activity.average_pace_seconds_per_km) : null)
    const actualDistanceKm = activity.distance_meters ? Number(activity.distance_meters) / 1000 : null
    const actualDurationMin = activity.moving_time_seconds ? Number(activity.moving_time_seconds) / 60 : null
    const scheduledDate = activity.start_date_local
        ? String(activity.start_date_local).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    const payload = {
        actual_distance_km: actualDistanceKm,
        actual_duration_min: actualDurationMin,
        actual_avg_pace: pace,
        avg_heart_rate: activity.average_heartrate ? Math.round(Number(activity.average_heartrate)) : null,
        max_heart_rate: activity.max_heartrate ? Math.round(Number(activity.max_heartrate)) : null,
        rpe: activity.rpe,
        feedback_notes: activity.athlete_notes,
        is_completed: true,
        performed_date: activity.start_date ?? new Date().toISOString(),
        source_provider: 'strava',
        provider_activity_id: activity.provider_activity_id,
        strava_activity_id: activity.id,
        source_payload: activity.raw_payload,
    }

    if (activity.matched_planned_session_id) {
        const { error } = await supabase
            .from('cardio_sessions')
            .update(payload)
            .eq('id', activity.matched_planned_session_id)
            .eq('client_id', activity.client_id)

        if (error) throw new Error(error.message)
        return activity.matched_planned_session_id as string
    }

    const { data: existing, error: existingError } = await supabase
        .from('cardio_sessions')
        .select('id')
        .eq('source_provider', 'strava')
        .eq('provider_activity_id', activity.provider_activity_id)
        .maybeSingle()

    if (existingError) throw new Error(existingError.message)

    if (existing?.id) {
        const { error } = await supabase
            .from('cardio_sessions')
            .update(payload)
            .eq('id', existing.id)

        if (error) throw new Error(error.message)
        return existing.id as string
    }

    const { data, error } = await supabase
        .from('cardio_sessions')
        .insert({
            client_id: activity.client_id,
            coach_id: activity.coach_id,
            scheduled_date: scheduledDate,
            activity_type: mapStravaSportToDiscipline(activity.raw_payload || activity),
            training_type: activity.sport_type || activity.activity_type || 'strava',
            name: activity.name || 'Actividad importada',
            description: 'Importada automáticamente',
            external_link: `https://www.strava.com/activities/${activity.provider_activity_id}`,
            ...payload,
        })
        .select('id')
        .single()

    if (error) throw new Error(error.message)
    return data.id as string
}

export async function saveStravaActivityFeedback(context: AuthenticatedClientContext, activityId: string, input: {
    rpe: number
    athleteNotes: string | null
}) {
    const supabase = createAdminClient()
    const { data: updated, error } = await supabase
        .from('strava_activities')
        .update({
            rpe: input.rpe,
            athlete_notes: input.athleteNotes,
            feedback_status: 'completed',
        })
        .eq('id', activityId)
        .eq('client_id', context.clientId)
        .select('*')
        .single()

    if (error) throw new Error(error.message)

    const cardioSessionId = await completeCardioSessionForActivity(updated)
    const { error: linkError } = await supabase
        .from('strava_activities')
        .update({ cardio_session_id: cardioSessionId })
        .eq('id', updated.id)

    if (linkError) throw new Error(linkError.message)
    return { cardioSessionId }
}

export async function processStravaWebhookEvent(event: StravaWebhookEvent) {
    const supabase = createAdminClient()
    const ownerId = String(event.owner_id)

    if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
        const { error } = await supabase
            .from('athlete_integrations')
            .update({ status: 'revoked', access_token: null, refresh_token: null, error_message: 'Strava access revoked' })
            .eq('provider', 'strava')
            .eq('provider_athlete_id', ownerId)

        if (error) throw new Error(error.message)
        return
    }

    if (event.object_type !== 'activity') return

    const { data: integration, error } = await supabase
        .from('athlete_integrations')
        .select('*')
        .eq('provider', 'strava')
        .eq('provider_athlete_id', ownerId)
        .eq('status', 'connected')
        .maybeSingle()

    if (error) throw new Error(error.message)
    if (!integration) return

    if (event.aspect_type === 'delete') {
        const { error: deleteError } = await supabase
            .from('strava_activities')
            .update({ is_deleted: true })
            .eq('provider', 'strava')
            .eq('provider_activity_id', String(event.object_id))

        if (deleteError) throw new Error(deleteError.message)
        return
    }

    const { activity } = await importStravaActivityForIntegration(integration, event.object_id)
    await supabase
        .from('athlete_integrations')
        .update({ last_sync_at: new Date().toISOString(), error_message: null })
        .eq('id', integration.id)

    if (event.aspect_type === 'create') {
        await sendPushToClient(integration.client_id, {
            title: 'Actividad importada',
            body: `${activity.name || 'Nueva actividad'} lista para RPE y notas.`,
            url: '/progress',
            tag: `strava-activity-${event.object_id}`,
        })
    }
}

export function validateWebhookEvent(value: unknown): StravaWebhookEvent | null {
    if (!value || typeof value !== 'object') return null
    const event = value as Partial<StravaWebhookEvent>
    if (!event.object_type || !event.aspect_type || !event.object_id || !event.owner_id) return null
    if (!['activity', 'athlete'].includes(event.object_type)) return null
    if (!['create', 'update', 'delete'].includes(event.aspect_type)) return null
    return event as StravaWebhookEvent
}
