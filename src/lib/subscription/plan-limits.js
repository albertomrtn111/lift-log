// Límites del plan del espacio: atletas activos y miembros del equipo (NXT-129).
// Los aplica la base (disparadores de clients y coach_memberships); aquí solo se
// traduce su error, o la comprobación previa, a un mensaje claro para el coach.
// Lógica pura, probada con node --test (scripts/plan-limits.test.mjs).

/** Pistas (hint) con las que la base señala cada rechazo */
export const ATHLETE_LIMIT_HINT = 'athlete_limit'
export const MEMBER_LIMIT_HINT = 'member_limit'
export const SUBSCRIPTION_INACTIVE_HINT = 'subscription_inactive'

/**
 * @typedef {{ code?: string | null, message?: string | null, details?: string | null, hint?: string | null }} DbError
 * @typedef {'create' | 'reactivate'} AthleteAction
 * @typedef {'invite' | 'join'} MemberAction
 */

/** @param {DbError | null | undefined} error */
export function isAthleteLimitError(error) {
    return error?.hint === ATHLETE_LIMIT_HINT
}

/** @param {DbError | null | undefined} error */
export function isMemberLimitError(error) {
    return error?.hint === MEMBER_LIMIT_HINT
}

/** @param {DbError | null | undefined} error */
export function isSubscriptionInactiveError(error) {
    return error?.hint === SUBSCRIPTION_INACTIVE_HINT
}

/**
 * Límite que la base deja en el detalle del error, o null si no viene.
 * @param {DbError | null | undefined} error
 */
export function limitFromError(error) {
    const value = String(error?.details ?? '').trim()
    if (!/^\d+$/.test(value)) return null
    return Number(value)
}

/**
 * Mensaje cuando no caben más atletas activos.
 * @param {number | null} limit límite del plan (null si no se sabe)
 * @param {AthleteAction} action
 * @param {{ inactive?: boolean }} [options] inactive: la suscripción no da acceso
 */
export function athleteLimitMessage(limit, action, options = {}) {
    if (options.inactive) {
        return action === 'reactivate'
            ? 'Tu suscripción no está activa, así que ahora no puedes reactivar atletas.'
            : 'Tu suscripción no está activa, así que ahora no puedes dar de alta atletas.'
    }
    const reached = limit === null
        ? 'Has llegado al límite de atletas activos de tu plan.'
        : `Has llegado al límite de atletas activos de tu plan (${limit}).`
    return action === 'reactivate'
        ? `No se puede reactivar: ${reached.charAt(0).toLowerCase()}${reached.slice(1)} Da de baja a otro atleta o amplía tu plan.`
        : `${reached} Para dar de alta a otro, da de baja a alguno o amplía tu plan.`
}

/**
 * Mensaje cuando no caben más miembros en el equipo.
 * @param {number | null} limit límite del plan (null si no se sabe)
 * @param {MemberAction} action invite: quien invita; join: quien acepta la invitación
 * @param {{ inactive?: boolean }} [options]
 */
export function memberLimitMessage(limit, action, options = {}) {
    if (options.inactive) {
        return action === 'join'
            ? 'La suscripción de este espacio no está activa, así que ahora no se pueden añadir miembros. Avisa a quien te invitó.'
            : 'Tu suscripción no está activa, así que ahora no puedes invitar a nadie al equipo.'
    }
    if (action === 'join') {
        const count = limit === null ? '' : ` (${limit})`
        return `Este espacio ha llegado al límite de miembros del equipo de su plan${count}. Pide a quien te invitó que libere una plaza y vuelve a intentarlo.`
    }
    const count = limit === null ? 'Tu plan no admite más miembros en el equipo' : `Tu plan admite ${limit === 1 ? '1 miembro' : `${limit} miembros`} en el equipo`
    return `${count} y ya están todas las plazas ocupadas, contando las invitaciones pendientes. Quita a alguien o cancela una invitación para invitar a otra persona.`
}

/**
 * Mensaje para un error de la base al dar de alta o reactivar atletas, o null si no es de límite.
 * @param {DbError | null | undefined} error
 * @param {AthleteAction} action
 */
export function athleteLimitErrorMessage(error, action) {
    if (isSubscriptionInactiveError(error)) return athleteLimitMessage(null, action, { inactive: true })
    if (isAthleteLimitError(error)) return athleteLimitMessage(limitFromError(error), action)
    return null
}

/**
 * Mensaje para un error de la base al añadir un miembro, o null si no es de límite.
 * @param {DbError | null | undefined} error
 * @param {MemberAction} action
 */
export function memberLimitErrorMessage(error, action) {
    if (isSubscriptionInactiveError(error)) return memberLimitMessage(null, action, { inactive: true })
    if (isMemberLimitError(error)) return memberLimitMessage(limitFromError(error), action)
    return null
}

/**
 * Comprobación previa (antes de tocar Facturación al reactivar): mensaje si no cabe
 * otro atleta activo, o null si cabe. La base lo vuelve a comprobar.
 * @param {{ limit: number | null, active: number, live: boolean } | null} usage null = no se sabe
 * @param {AthleteAction} action
 */
export function athleteSeatMessage(usage, action) {
    if (!usage || usage.limit === null) return null
    if (usage.active < usage.limit) return null
    return athleteLimitMessage(usage.limit, action, { inactive: usage.limit === 0 && !usage.live })
}
