'use client'

/**
 * Sube un archivo a /api/media/upload. El servidor comprueba permisos, convierte
 * las fotos a WebP y decide dónde guardarlo (R2 o, si no está configurado,
 * Supabase Storage). Se usa XMLHttpRequest para poder mostrar el progreso.
 */
export function uploadMedia<T>(
    fields: Record<string, string>,
    file: Blob,
    fileName: string,
    onProgress?: (fraction: number) => void,
): Promise<{ data?: T; error?: string }> {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.append(name, value)
    form.append('fileName', fileName)
    form.append('file', file, fileName)

    return new Promise(resolve => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/media/upload')
        xhr.responseType = 'json'
        xhr.upload.onprogress = (event) => {
            // El último tramo es la conversión en el servidor: no llegar al 100 % antes
            if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(0.95, event.loaded / event.total))
        }
        xhr.onload = () => {
            const body = xhr.response as (T & { error?: string }) | null
            if (xhr.status >= 200 && xhr.status < 300 && body) {
                onProgress?.(1)
                resolve({ data: body })
            } else {
                console.error('[media-upload]', xhr.status, body)
                resolve({ error: body?.error || 'No se pudo subir el archivo. Inténtalo de nuevo.' })
            }
        }
        xhr.onerror = () => resolve({ error: 'Sin conexión: no se pudo subir el archivo.' })
        xhr.send(form)
    })
}
