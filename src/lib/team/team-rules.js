/** Reglas del equipo, sin dependencias para poder probarlas con node --test. */

/** Roles que cuentan como miembros del equipo. */
export const TEAM_ROLES = ['owner', 'admin', 'coach', 'reception']

/** Roles que se pueden invitar hoy. Recepción llega cuando tenga sus pantallas. */
export const INVITABLE_ROLES = ['admin', 'coach']

export const ROLE_LABELS = {
    owner: 'Propietario',
    admin: 'Administrador',
    coach: 'Profesional',
    reception: 'Recepción',
}

export function canManageTeam(role) {
    return role === 'owner' || role === 'admin'
}

/** El propietario gestiona a todos menos a sí mismo; el administrador, a quien no sea propietario. */
export function canChangeMember({ actorRole, actorUserId, targetRole, targetUserId }) {
    if (!canManageTeam(actorRole)) return false
    if (actorUserId === targetUserId) return false
    if (targetRole === 'owner') return false
    return true
}

export function normalizeEmail(email) {
    return String(email ?? '').trim().toLowerCase()
}

export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Plazas libres contando las invitaciones pendientes. null = sin límite. */
export function seatsLeft(limit, activeMembers, pendingInvitations) {
    if (limit === null || limit === undefined) return null
    return Math.max(0, limit - activeMembers - pendingInvitations)
}

export function invitationState(invitation, now = new Date()) {
    if (invitation.status !== 'pending') return invitation.status
    return new Date(invitation.expires_at) <= now ? 'expired' : 'pending'
}
