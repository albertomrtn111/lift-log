'use server'

import { revalidatePath } from 'next/cache'
import { getCoachActor } from '@/lib/auth/get-coach-actor'
import { BRANDING_SLOTS, parseBranding } from '@/lib/branding/branding-rules'
import type { WorkspaceBranding } from '@/lib/branding/get-branding'
import { deleteObject, publicBucket } from '@/lib/storage/r2'
import { canManageTeam } from '@/lib/team/team-rules'

export interface BrandingData {
    enabled: boolean
    canManage: boolean
    branding: WorkspaceBranding | null
}

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const NOT_ALLOWED = 'Solo el propietario y los administradores pueden cambiarlo.'

async function requireBrandingManager() {
    const actor = await getCoachActor()
    if (!canManageTeam(actor.role)) throw new Error(NOT_ALLOWED)
    const { data: enabled } = await actor.supabase.rpc('coach_has_feature', {
        p_coach_id: actor.coachId,
        p_feature: 'branding',
    })
    if (!enabled) throw new Error('Tu plan no incluye look & feel.')
    return actor
}

function failure(cause: unknown, fallback: string): { success: false; error: string } {
    return { success: false, error: cause instanceof Error && cause.message ? cause.message : fallback }
}

export async function getBrandingAction(): Promise<ActionResult<BrandingData>> {
    try {
        const { supabase, coachId, role } = await getCoachActor()
        const [{ data: enabled }, { data, error }] = await Promise.all([
            supabase.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'branding' }),
            supabase.from('workspace_branding').select('*').eq('coach_id', coachId).maybeSingle(),
        ])
        if (error) return { success: false, error: 'No se pudo cargar el look & feel.' }
        return {
            success: true,
            data: {
                enabled: enabled === true,
                canManage: canManageTeam(role),
                branding: data as WorkspaceBranding | null,
            },
        }
    } catch {
        return { success: false, error: 'No se pudo cargar el look & feel.' }
    }
}

export async function saveBrandingAction(input: {
    displayName: string
    primaryColor: string
    accentColor: string
    reportFooter: string
}): Promise<ActionResult> {
    const parsed = parseBranding(input)
    if ('error' in parsed) return { success: false, error: parsed.error }
    try {
        const { supabase, coachId, userId } = await requireBrandingManager()
        const { error } = await supabase.from('workspace_branding').upsert(
            {
                coach_id: coachId,
                display_name: parsed.values.displayName,
                primary_color: parsed.values.primaryColor,
                accent_color: parsed.values.accentColor,
                report_footer: parsed.values.reportFooter,
                updated_by: userId,
            },
            { onConflict: 'coach_id' }
        )
        if (error) return { success: false, error: 'No se pudo guardar.' }
        revalidatePath('/', 'layout')
        return { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo guardar.')
    }
}

export async function removeBrandingImageAction(slot: string): Promise<ActionResult> {
    if (!BRANDING_SLOTS.includes(slot)) return { success: false, error: 'Imagen no válida.' }
    const column = `${slot}_url`
    try {
        const { supabase, coachId, userId } = await requireBrandingManager()
        const { data: current } = await supabase
            .from('workspace_branding')
            .select(column)
            .eq('coach_id', coachId)
            .maybeSingle()

        const { error } = await supabase
            .from('workspace_branding')
            .update({ [column]: null, updated_by: userId })
            .eq('coach_id', coachId)
        if (error) return { success: false, error: 'No se pudo quitar la imagen.' }

        const url = (current as Record<string, string | null> | null)?.[column]
        const r2 = publicBucket()
        if (r2 && url?.startsWith(`${r2.publicUrl}/branding/${coachId}/`)) {
            await deleteObject(r2.bucket, url.slice(r2.publicUrl.length + 1)).catch(() => undefined)
        }
        revalidatePath('/', 'layout')
        return { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo quitar la imagen.')
    }
}
