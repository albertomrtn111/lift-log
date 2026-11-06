'use server'

import { createClient } from '@/lib/supabase/server'
import { parseMediaLink } from '@/lib/studio/media-rules'
import { deleteObject, privateBucket } from '@/lib/storage/r2'

export type MediaResult = { success: true } | { success: false; error: string }

type RpcError = { code?: string; message?: string }

function failure(error: RpcError): MediaResult {
    if (error.code === '42501') return { success: false, error: 'No tienes permiso para hacer esto.' }
    if (error.code === '22023') return { success: false, error: error.message ?? 'Revisa los datos.' }
    return { success: false, error: 'No se ha podido guardar. Inténtalo de nuevo.' }
}

/** El archivo sobra cuando ya nadie lo usa. Si falla, no molesta: queda sin enlazar. */
async function dropFile(key: string | null | undefined) {
    const bucket = privateBucket()
    if (!key || !bucket) return
    await deleteObject(bucket, key).catch(error => console.warn('[sala/media]', error))
}

export async function addExerciseLinkAction(input: {
    coachId: string
    catalogExerciseId: string
    clientId: string | null
    text: string
    title: string
}): Promise<MediaResult> {
    const link = parseMediaLink(input.text)
    if ('error' in link) return { success: false, error: link.error }

    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_add_exercise_media', {
        p_coach_id: input.coachId,
        p_catalog_exercise_id: input.catalogExerciseId,
        p_client_id: input.clientId,
        p_kind: link.kind,
        p_url: link.url,
        p_storage_key: null,
        p_title: input.title,
    })
    return error ? failure(error) : { success: true }
}

export async function addExerciseImageAction(input: {
    coachId: string
    catalogExerciseId: string
    clientId: string | null
    storageKey: string
    title: string
}): Promise<MediaResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_add_exercise_media', {
        p_coach_id: input.coachId,
        p_catalog_exercise_id: input.catalogExerciseId,
        p_client_id: input.clientId,
        p_kind: 'image',
        p_url: null,
        p_storage_key: input.storageKey,
        p_title: input.title,
    })
    return error ? failure(error) : { success: true }
}

export async function removeExerciseMediaAction(mediaId: string): Promise<MediaResult> {
    const supabase = await createClient()
    const { data } = await supabase.from('exercise_media').select('storage_key').eq('id', mediaId).maybeSingle()
    const { error } = await supabase.rpc('studio_remove_exercise_media', { p_media_id: mediaId })
    if (error) return failure(error)
    await dropFile(data?.storage_key)
    return { success: true }
}

/** Guarda la imagen y el enlace de una celda. Vacíos, los quita. */
export async function saveCellAttachmentAction(input: {
    itemId: string
    imageKey: string | null
    linkText: string
}): Promise<MediaResult> {
    let linkUrl: string | null = null
    if (input.linkText.trim()) {
        const link = parseMediaLink(input.linkText)
        if ('error' in link) return { success: false, error: link.error }
        linkUrl = link.url
    }

    const supabase = await createClient()
    const { data: previous } = await supabase
        .from('studio_item_attachments')
        .select('image_key')
        .eq('item_id', input.itemId)
        .maybeSingle()
    const { error } = await supabase.rpc('studio_save_item_attachment', {
        p_item_id: input.itemId,
        p_image_key: input.imageKey,
        p_link_url: linkUrl,
    })
    if (error) return failure(error)
    if (previous?.image_key !== input.imageKey) await dropFile(previous?.image_key)
    return { success: true }
}

/** Da de alta en la carpeta un vídeo ya subido. Si falla, el archivo queda sin enlazar. */
export async function saveVideoAction(input: {
    coachId: string
    clientId: string | null
    storageKey: string
    thumbKey: string | null
    title: string
    durationSeconds: number | null
    sizeBytes: number
    mime: string
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_add_media_asset', {
        p_coach_id: input.coachId,
        p_client_id: input.clientId,
        p_storage_key: input.storageKey,
        p_thumb_key: input.thumbKey,
        p_title: input.title,
        p_duration_seconds: input.durationSeconds,
        p_size_bytes: input.sizeBytes,
        p_mime: input.mime,
    })
    if (error) return failure(error) as { success: false; error: string }
    return { success: true, id: data.id }
}

export async function assignVideoAction(assetId: string, catalogExerciseId: string, clientId: string | null): Promise<MediaResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_assign_video', {
        p_asset_id: assetId,
        p_catalog_exercise_id: catalogExerciseId,
        p_client_id: clientId,
    })
    return error ? failure(error) : { success: true }
}

export async function renameVideoAction(assetId: string, title: string): Promise<MediaResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_rename_media_asset', { p_asset_id: assetId, p_title: title })
    return error ? failure(error) : { success: true }
}

export async function removeVideoAction(assetId: string): Promise<MediaResult> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_remove_media_asset', { p_asset_id: assetId })
    if (error) return failure(error)
    await Promise.all(((data ?? []) as string[]).map(dropFile))
    return { success: true }
}

export interface FolderVideo {
    id: string
    client_id: string | null
    title: string
    thumb_key: string | null
    duration_seconds: number | null
}

/** Para elegir un vídeo desde la celda. Solo se pide al abrir la lista. */
export async function listFolderVideosAction(coachId: string): Promise<FolderVideo[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('media_assets')
        .select('id, client_id, title, thumb_key, duration_seconds')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
    return (data ?? []) as FolderVideo[]
}

export async function countClientMediaAction(clientId: string): Promise<number> {
    const supabase = await createClient()
    const { data } = await supabase.rpc('studio_count_client_media', { p_client_id: clientId })
    return data ?? 0
}

/** Borra lo que quedó oculto al retirar el consentimiento, con sus archivos. */
export async function purgeClientMediaAction(clientId: string): Promise<MediaResult> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_purge_client_media', { p_client_id: clientId })
    if (error) return failure(error)
    await Promise.all(((data ?? []) as string[]).map(dropFile))
    return { success: true }
}

export async function setImageConsentAction(clientId: string, accepted: boolean): Promise<MediaResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_image_consent', { p_client_id: clientId, p_accepted: accepted })
    return error ? failure(error) : { success: true }
}
