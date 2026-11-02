import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePrivateKey } from '@/lib/storage/media-refs'
import { canAccessPrivateMedia } from '@/lib/storage/media-access'
import { deleteObject, getObject, presignGet, privateBucket, privateDeliveryMode } from '@/lib/storage/r2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Fotos privadas guardadas en R2 (check-ins y chat): /api/media/{clave}.
 * Comprueba la sesión y los permisos en cada petición y después entrega el
 * archivo desde el servidor (proxy) o redirige a una URL firmada de 5 minutos.
 */

/** Tipos que el navegador puede mostrar sin riesgo; el resto se descarga. */
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|audio\/[\w.+-]+|video\/(mp4|webm|quicktime)|application\/pdf)$/i

type Params = { params: { key: string[] } }

async function authorize(params: Params['params']) {
    const key = params.key.map(decodeURIComponent).join('/')
    const parsed = parsePrivateKey(key)
    if (!parsed) return { response: new NextResponse(null, { status: 404 }) }

    const bucket = privateBucket()
    if (!bucket) return { response: new NextResponse(null, { status: 404 }) }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { response: new NextResponse(null, { status: 401 }) }

    const allowed = await canAccessPrivateMedia(supabase, user.id, parsed.area, parsed.coachId, parsed.clientId)
    if (!allowed) return { response: new NextResponse(null, { status: 403 }) }

    return { key, bucket, parsed }
}

export async function GET(_request: Request, { params }: Params) {
    const auth = await authorize(params)
    if ('response' in auth) return auth.response
    const { key, bucket, parsed } = auth

    try {
        if (privateDeliveryMode() === 'redirect') {
            const url = await presignGet(bucket, key, 300)
            return NextResponse.redirect(url, {
                status: 302,
                headers: { 'Cache-Control': 'private, max-age=240' },
            })
        }

        const object = await getObject(bucket, key)
        if (!object.Body) return new NextResponse(null, { status: 404 })

        const contentType = object.ContentType || 'application/octet-stream'
        const headers = new Headers({
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
            // Archivos subidos por usuarios servidos desde el dominio de la app:
            // nunca se ejecutan como página
            'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
            'Content-Disposition': `${INLINE_TYPES.test(contentType.split(';')[0].trim()) ? 'inline' : 'attachment'}; filename="${parsed.fileName}"`,
        })
        if (object.ContentLength != null) headers.set('Content-Length', String(object.ContentLength))
        if (object.ETag) headers.set('ETag', object.ETag)

        return new NextResponse(object.Body.transformToWebStream(), { status: 200, headers })
    } catch (error) {
        const name = (error as { name?: string })?.name
        if (name === 'NoSuchKey' || name === 'NotFound') return new NextResponse(null, { status: 404 })
        console.error('[media] GET', key, error)
        return new NextResponse(null, { status: 502 })
    }
}

export async function DELETE(_request: Request, { params }: Params) {
    const auth = await authorize(params)
    if ('response' in auth) return auth.response
    // Solo las fotos de check-in se pueden borrar desde la app
    if (auth.parsed.area !== 'checkin-media') return new NextResponse(null, { status: 405 })

    try {
        await deleteObject(auth.bucket, auth.key)
        return new NextResponse(null, { status: 204 })
    } catch (error) {
        console.error('[media] DELETE', auth.key, error)
        return new NextResponse(null, { status: 502 })
    }
}
