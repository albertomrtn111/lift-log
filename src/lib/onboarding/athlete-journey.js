/**
 * Seguimiento del alta de un atleta en el panel del coach. Lógica pura
 * (testeada en scripts/).
 *
 * @typedef {{
 *   invitedAt: string | null
 *   signedUpAt: string | null
 *   acceptedAt: string | null
 *   hasPushSubscription: boolean
 *   onboarding: 'none' | 'pending' | 'completed'
 * }} JourneyInput
 *
 * @typedef {{ id: 'invited' | 'account' | 'push' | 'onboarding', label: string, done: boolean, skipped: boolean }} JourneyStep
 *
 * @typedef {{ steps: JourneyStep[], done: number, total: number, complete: boolean, canResend: boolean }} Journey
 */

/**
 * @param {JourneyInput} input
 * @returns {Journey}
 */
export function buildAthleteJourney(input) {
    const accountCreated = Boolean(input.signedUpAt || input.acceptedAt)
    /** @type {JourneyStep[]} */
    const steps = [
        { id: 'invited', label: 'Invitación enviada', done: Boolean(input.invitedAt) || accountCreated, skipped: false },
        { id: 'account', label: 'Cuenta creada', done: accountCreated, skipped: false },
        { id: 'push', label: 'Avisos activados', done: input.hasPushSubscription, skipped: false },
        {
            id: 'onboarding',
            label: input.onboarding === 'none' ? 'Sin onboarding' : 'Onboarding completado',
            done: input.onboarding === 'completed',
            skipped: input.onboarding === 'none',
        },
    ]
    const counted = steps.filter(step => !step.skipped)
    const done = counted.filter(step => step.done).length
    return {
        steps,
        done,
        total: counted.length,
        complete: done === counted.length,
        // Mientras no haya creado su cuenta, el enlace puede haber caducado
        canResend: !accountCreated,
    }
}

/**
 * Estado del onboarding a partir de sus checkins de tipo onboarding.
 * Un formulario enviado queda en 'reviewed' (o 'archived' si se cerró después).
 * @param {{ status: string | null }[]} onboardingCheckins
 * @returns {'none' | 'pending' | 'completed'}
 */
export function onboardingStateFromCheckins(onboardingCheckins) {
    if (onboardingCheckins.length === 0) return 'none'
    if (onboardingCheckins.some(checkin => checkin.status === 'reviewed')) return 'completed'
    if (onboardingCheckins.some(checkin => checkin.status === 'pending')) return 'pending'
    return 'completed'
}
