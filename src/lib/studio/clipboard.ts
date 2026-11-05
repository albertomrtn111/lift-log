/**
 * Portapapeles de sala: vive en el navegador del profesional y sirve entre clientes.
 * Si el almacenamiento no está disponible, copiar dura hasta recargar la página.
 */
const CLIP_KEY = 'nexttrain:studio-clip'

export interface StudioClipItem {
    catalog_exercise_id: string
    exercise_name: string
    section_title?: string | null
    [field: string]: unknown
}

export type StudioClip =
    | { kind: 'cell'; label: string; item: StudioClipItem }
    | { kind: 'session'; label: string; fromSessionId: string; items: StudioClipItem[] }

export function readClip(): StudioClip | null {
    try {
        const saved = window.localStorage.getItem(CLIP_KEY)
        return saved ? (JSON.parse(saved) as StudioClip) : null
    } catch {
        return null
    }
}

export function writeClip(clip: StudioClip | null) {
    try {
        if (clip) window.localStorage.setItem(CLIP_KEY, JSON.stringify(clip))
        else window.localStorage.removeItem(CLIP_KEY)
    } catch {
        // Sin almacenamiento, el portapapeles se queda en memoria.
    }
}
