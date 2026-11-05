/** Roles del equipo que entrenan y usan la zona de coach. Recepción aún no tiene pantallas. */
export const COACH_AREA_ROLES = ['owner', 'admin', 'coach'] as const

export type CoachAreaRole = (typeof COACH_AREA_ROLES)[number]
