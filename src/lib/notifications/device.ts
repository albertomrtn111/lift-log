// Utilidades de navegador para el push: qué dispositivo es, cómo desbloquear
// el permiso, recordar un «Ahora no» y pedir un aviso de prueba.

export function isIOS(): boolean {
    if (typeof window === 'undefined') return false
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isAndroid(): boolean {
    return typeof window !== 'undefined' && /Android/i.test(navigator.userAgent)
}

export function isRunningAsPWA(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Cómo volver a permitir las notificaciones si el usuario las bloqueó. */
export function blockedPermissionHelp(): string {
    if (isIOS()) return 'En el iPhone: Ajustes → Notificaciones → NexTrain → Permitir notificaciones.'
    if (isAndroid()) return 'En Android: mantén pulsado el icono de NexTrain → Información de la app → Notificaciones.'
    return 'En el navegador: pulsa el candado junto a la dirección → Notificaciones → Permitir, y recarga la página.'
}

/** Guarda que el usuario dijo «Ahora no» para no insistir durante `days` días. */
export function rememberDismissal(key: string) {
    try {
        window.localStorage.setItem(key, String(Date.now()))
    } catch {
        // Modo privado o almacenamiento bloqueado: el aviso volverá a salir, sin más.
    }
}

export function isDismissed(key: string, days: number): boolean {
    try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        return Date.now() - Number(raw) < days * 86_400_000
    } catch {
        return false
    }
}

export type PushTestResult = { ok: true; devices: number; delivered: number } | { ok: false; error: string }

/** Pide al servidor un aviso de prueba a los dispositivos del propio usuario. */
export async function sendTestPush(audience: 'client' | 'coach'): Promise<PushTestResult> {
    try {
        const response = await fetch('/api/push/test-self', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audience }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return { ok: false, error: data?.error || 'No se pudo enviar la prueba.' }
        return { ok: true, devices: Number(data.devices ?? 0), delivered: Number(data.delivered ?? 0) }
    } catch {
        return { ok: false, error: 'Sin conexión con el servidor.' }
    }
}

/** Texto para el resultado de una prueba. */
export function describePushTest(result: PushTestResult): { ok: boolean; message: string } {
    if (!result.ok) return { ok: false, message: result.error }
    if (result.devices === 0) return { ok: false, message: 'No hay ningún dispositivo con avisos activados.' }
    if (result.delivered === 0) return { ok: false, message: 'No se pudo entregar a ningún dispositivo. Vuelve a activar las notificaciones.' }
    return {
        ok: true,
        message: result.devices === 1
            ? 'Prueba enviada. Debería llegarte en unos segundos.'
            : `Prueba enviada a ${result.delivered} de ${result.devices} dispositivos.`,
    }
}
