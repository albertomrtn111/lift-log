// Qué ve cada atleta en la app (probado con node --test).

/** Sin datos, o para quien no es atleta, no se limita nada: nadie debe perder la app por un fallo. */
export const ALL_MODULES = { app: true, sessions: false, routine: true, diet: true, chat: true }

/** @param {Partial<typeof ALL_MODULES> | null | undefined} modules */
export function athleteModules(modules) {
  return { ...ALL_MODULES, ...(modules ?? {}) }
}

/**
 * Pestañas de la app, en orden.
 * @param {typeof ALL_MODULES} modules
 * @returns {('routine' | 'sessions' | 'diet' | 'planning' | 'summary' | 'chat')[]}
 */
export function athleteTabs(modules) {
  return [
    ...(modules.routine ? ['routine'] : []),
    ...(modules.sessions ? ['sessions'] : []),
    ...(modules.diet ? ['diet'] : []),
    'planning',
    'summary',
    ...(modules.chat ? ['chat'] : []),
  ]
}

/** La pantalla de entrada es Fuerza, salvo que no tenga programa. @param {typeof ALL_MODULES} modules */
export function athleteHome(modules) {
  return modules.routine ? '/routine' : modules.sessions ? '/sesiones' : '/planning'
}
