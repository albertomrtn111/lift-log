import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { sendTrialNoticeEmail } from '@/lib/email/mailer'
import { schedulerTimezone } from '@/lib/reviews/scheduler'
import { trialNoticeCopy, trialNoticeKind } from './access.js'

const DAY_MS = 24 * 60 * 60 * 1000

export interface TrialNoticeSummary {
    candidates: number
    sent: number
    errors: number
}

/**
 * Emails de aviso de la prueba gratis (7 días, 48 h y recién terminada) a los
 * propietarios de cada espacio. Lo llama una vez al día el cron de revisiones.
 * Idempotente con coach_reminder_log (unique coach_id + kind + remind_date),
 * con remind_date = día en que acaba la prueba: un aviso de cada tipo por prueba.
 */
export async function dispatchTrialNotices(now = new Date()): Promise<TrialNoticeSummary> {
    const admin = createAdminClient()
    const summary: TrialNoticeSummary = { candidates: 0, sent: 0, errors: 0 }

    const { data: subscriptions, error } = await admin
        .from('coach_subscriptions')
        .select('coach_id, status, trial_ends_at, stripe_subscription_id')
        .eq('status', 'trialing')
        .is('stripe_subscription_id', null)
        .gte('trial_ends_at', new Date(now.getTime() - 3 * DAY_MS).toISOString())
        .lte('trial_ends_at', new Date(now.getTime() + 7 * DAY_MS).toISOString())
    if (error) throw new Error(`Error consultando pruebas: ${error.message}`)

    const ctaUrl = `${getAppUrl()}/coach/subscription`
    const timeZone = schedulerTimezone()

    for (const subscription of subscriptions ?? []) {
        const kind = trialNoticeKind(subscription, now)
        if (!kind || !subscription.trial_ends_at) continue
        summary.candidates++

        const remindDate = subscription.trial_ends_at.slice(0, 10)
        const { error: claimError } = await admin
            .from('coach_reminder_log')
            .insert({ coach_id: subscription.coach_id, kind, remind_date: remindDate })
        if (claimError) {
            if (claimError.code !== '23505') {
                console.error('[trial-notices] Error en coach_reminder_log:', claimError.message)
                summary.errors++
            }
            continue
        }

        const { data: owners, error: ownersError } = await admin
            .from('coach_memberships')
            .select('user_id, profile:profiles ( email, full_name )')
            .eq('coach_id', subscription.coach_id)
            .eq('role', 'owner')
            .eq('status', 'active')

        let delivered = false
        if (ownersError) {
            console.error('[trial-notices] Error leyendo propietarios:', ownersError.message)
        } else {
            for (const owner of owners ?? []) {
                const profile = (Array.isArray(owner.profile) ? owner.profile[0] : owner.profile) as { email: string | null; full_name: string | null } | null
                if (!profile?.email) continue
                const firstName = profile.full_name?.trim().split(/\s+/)[0] || null
                const copy = trialNoticeCopy({ kind, trialEndsAt: subscription.trial_ends_at, firstName, timeZone, now })
                const result = await sendTrialNoticeEmail({ to: profile.email, copy, ctaUrl })
                if (result.ok) delivered = true
            }
        }

        if (delivered) {
            summary.sent++
        } else {
            // Sin enviar: se libera para reintentarlo mañana
            summary.errors++
            await admin
                .from('coach_reminder_log')
                .delete()
                .eq('coach_id', subscription.coach_id)
                .eq('kind', kind)
                .eq('remind_date', remindDate)
        }
    }

    return summary
}
