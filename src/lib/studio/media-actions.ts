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

export async function setImageConsentAction(clientId: string, accepted: boolean): Promise<MediaResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_image_consent', { p_client_id: clientId, p_accepted: accepted })
    return error ? failure(error) : { success: true }
}
