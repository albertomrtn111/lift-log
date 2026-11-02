import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AVATAR_MAX_SIDE, shouldPrepareImage } from '@/lib/chat-image-rules'
import {
    R2_BUCKET_MARKER,
    R2_REF_PREFIX,
    avatarKey,
    avatarKeyFromPublicUrl,
    chatKey,
    checkinKey,
    isUuid,
    sanitizeFileName,
    withExtension,
} from '@/lib/storage/media-refs'
import { canAccessChatMedia, canAccessCheckinMedia } from '@/lib/storage/media-access'
import { deleteObject, privateBucket, publicBucket, putObject } from '@/lib/storage/r2'
import { toWebp } from '@/lib/storage/webp'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Subida de fotos y adjuntos. Todo pasa por aquí: el navegador nunca habla con
 * R2 ni ve sus credenciales. Pasos: sesión → permisos (los mismos que las
 * políticas de Supabase) → WebP de 1600 px como máximo → R2.
 *
 * Si R2 no está configurado (o falta el bucket privado), el archivo se guarda en
 * Supabase Storage como antes, ya comprimido, para poder desplegar esto primero.
 *
 * Campos (multipart): kind = avatar | checkin | chat, file, fileName,
 * coachId y clientId (checkin y chat), checkinId (checkin).
 */

const MAX_INPUT_BYTES = {
    avatar: 15 * 1024 * 1024,
    checkin: 25 * 1024 * 1024,
    chat: 25 * 1024 * 1024, // límite del bucket chat-media
} as const

type Kind = keyof typeof MAX_INPUT_BYTES

function fail(status: number, error: string) {
    return NextResponse.json({ error }, { status })
}

function randomSuffix() {
    return crypto.randomUUID().slice(0, 8)
}

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fail(401, 'Tu sesión ha caducado. Vuelve a entrar para subir archivos.')

    let form: FormData
    try {
        form = await request.formData()
    } catch {
        return fail(400, 'No se recibió ningún archivo.')
    }

    const kind = form.get('kind') as Kind | null
    const file = form.get('file')
    if (!kind || !(kind in MAX_INPUT_BYTES) || !(file instanceof Blob) || file.size === 0) {
        return fail(400, 'No se recibió ningún archivo.')
    }
    if (file.size > MAX_INPUT_BYTES[kind]) {
        return fail(413, `El archivo supera el máximo de ${MAX_INPUT_BYTES[kind] / 1024 / 1024} MB.`)
    }

    const originalName = String(form.get('fileName') || (file instanceof File ? file.name : '') || 'archivo')
    const originalMime = file.type || 'application/octet-stream'
    const input = new Uint8Array(await file.arrayBuffer())

    // Las fotos se guardan siempre en WebP; GIF, audio y documentos, tal cual.
    let body: Uint8Array = input
    let mime = originalMime
    let fileName = sanitizeFileName(originalName)
    if (shouldPrepareImage(originalMime, originalName)) {
        const webp = await toWebp(input, kind === 'avatar' ? AVATAR_MAX_SIDE : undefined)
        if (webp) {
            body = webp
            mime = 'image/webp'
            fileName = sanitizeFileName(withExtension(originalName, 'webp'))
        } else if (kind === 'avatar') {
            return fail(415, 'Este formato de imagen no se puede usar. Prueba con una foto JPG o PNG.')
        }
    } else if (kind === 'avatar') {
        return fail(415, 'Este formato de imagen no se puede usar. Prueba con una foto JPG o PNG.')
    }

    try {
        if (kind === 'avatar') return await uploadAvatar(supabase, user.id, body, mime)

        const coachId = String(form.get('coachId') ?? '')
        const clientId = String(form.get('clientId') ?? '')
        if (!isUuid(coachId) || !isUuid(clientId)) return fail(400, 'Faltan datos de la subida.')

        if (kind === 'checkin') {
            const checkinId = String(form.get('checkinId') ?? '')
            if (!isUuid(checkinId)) return fail(400, 'Faltan datos de la subida.')
            if (!(await canAccessCheckinMedia(supabase, user.id, coachId, clientId))) {
                return fail(403, 'No puedes subir fotos a este check-in.')
            }
            const ext = mime === 'image/webp' ? 'webp' : (fileName.split('.').pop() || 'jpg')
            const name = `${Date.now()}_${randomSuffix()}.${ext}`
            const bucket = privateBucket()
            if (bucket) {
                const key = checkinKey({ coachId, clientId, checkinId, fileName: name })
                await putObject(bucket, key, body, mime)
                return NextResponse.json({ bucket: R2_BUCKET_MARKER, path: key, mime, size: body.byteLength })
            }
            const path = `${coachId}/${clientId}/${checkinId}/${name}`
            await uploadToSupabase('checkin-media', path, body, mime)
            return NextResponse.json({ bucket: 'checkin-media', path, mime, size: body.byteLength })
        }

        if (!(await canAccessChatMedia(supabase, user.id, coachId, clientId))) {
            return fail(403, 'No puedes enviar archivos a esta conversación.')
        }
        const name = `${crypto.randomUUID()}-${fileName}`
        const bucket = privateBucket()
        if (bucket) {
            const key = chatKey({ coachId, clientId, fileName: name })
            await putObject(bucket, key, body, mime)
            return NextResponse.json({ url: `${R2_REF_PREFIX}${key}`, name: fileNameForDisplay(originalName, mime), mime, size: body.byteLength })
        }
        const path = `${coachId}/${clientId}/${name}`
        await uploadToSupabase('chat-media', path, body, mime)
        return NextResponse.json({ url: path, name: fileNameForDisplay(originalName, mime), mime, size: body.byteLength })
    } catch (error) {
        console.error('[media/upload]', kind, error)
        return fail(500, 'No se pudo subir el archivo. Inténtalo de nuevo.')
    }
}

function fileNameForDisplay(originalName: string, mime: string) {
    return mime === 'image/webp' ? withExtension(originalName, 'webp') : originalName
}

async function uploadToSupabase(bucket: string, path: string, body: Uint8Array, mime: string) {
    // Permisos ya comprobados arriba con la sesión del usuario
    const { error } = await createAdminClient().storage
        .from(bucket)
        .upload(path, body, { contentType: mime, upsert: false })
    if (error) throw error
}

/**
 * Foto de perfil: se sube, se guarda en profiles.avatar_url y se borra la anterior
 * (solo si estaba en R2 y en la carpeta del propio usuario).
 */
async function uploadAvatar(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    body: Uint8Array,
    mime: string,
) {
    const fileName = `avatar-${Date.now()}.webp`
    const r2 = publicBucket()
    let url: string
    if (r2) {
        const key = avatarKey({ userId, fileName })
        await putObject(r2.bucket, key, body, mime)
        url = `${r2.publicUrl}/${key}`
    } else {
        const path = `${userId}/${fileName}`
        await uploadToSupabase('avatars', path, body, mime)
        url = createAdminClient().storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const { data: previous } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .maybeSingle()

    const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('id', userId)
    if (error) throw error

    const oldKey = r2 ? avatarKeyFromPublicUrl(previous?.avatar_url, r2.publicUrl) : null
    if (r2 && oldKey && oldKey.startsWith(`avatars/${userId}/`)) {
        await deleteObject(r2.bucket, oldKey).catch(err => console.warn('[media/upload] avatar anterior:', err))
    }

    revalidatePath('/profile')
    return NextResponse.json({ url, mime, size: body.byteLength })
}
