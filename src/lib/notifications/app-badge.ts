type BadgingNavigator = Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
}

/** Número en el icono de la app instalada (iOS 16.4+, Android, escritorio). */
export function syncAppBadge(count: number) {
    if (typeof navigator === 'undefined') return
    const nav = navigator as BadgingNavigator
    const request = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
    void request?.catch(() => { /* sin permiso o sin soporte: no pasa nada */ })
}
