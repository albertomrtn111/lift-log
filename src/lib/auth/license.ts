import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type LicenseContact = { name: string | null; email: string | null }

/** Por qué alguien con sesión no tiene acceso: le dieron de baja como atleta o del equipo. */
export type LostLicense =
    | { kind: 'athlete'; workspaceName: string; contact: LicenseContact; since: string | null }
    | { kind: 'staff'; workspaceName: string; contact: LicenseContact | null; isOwner: boolean }

const STAFF_ROLES = ['owner', 'admin', 'coach', 'reception']

/**
 * Busca la baja más reciente del usuario. Solo se llama desde /no-access, cuando ya
 * sabemos que no le queda ningún rol activo; usa la clave de servicio porque con su
 * sesión ya no puede leer su ficha ni su espacio.
 */
export async function getLostLicense(userId: string): Promise<LostLicense | null> {
    const admin = createAdminClient()

    const [{ data: client }, { data: membership }] = await Promise.all([
        admin
            .from('clients')
            .select('coach_id, deactivated_at, updated_at')
            .or(`user_id.eq.${userId},auth_user_id.eq.${userId}`)
            .neq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        admin
            .from('coach_memberships')
            .select('coach_id, role, created_at')
            .eq('user_id', userId)
            .neq('status', 'active')
            .in('role', STAFF_ROLES)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    // Si fue las dos cosas, manda la de equipo: es la que más pierde
    if (membership) {
        const coachId = membership.coach_id as string
        const isOwner = membership.role === 'owner'
        return {
            kind: 'staff',
            workspaceName: await workspaceName(admin, coachId),
            contact: isOwner ? null : await workspaceOwner(admin, coachId, userId),
            isOwner,
        }
    }

    if (client) {
        const coachId = client.coach_id as string
        return {
            kind: 'athlete',
            workspaceName: await workspaceName(admin, coachId),
            contact: (await workspaceOwner(admin, coachId, userId)) ?? { name: null, email: null },
            since: (client.deactivated_at as string | null) ?? null,
        }
    }

    return null
}

type Admin = ReturnType<typeof createAdminClient>

async function workspaceName(admin: Admin, coachId: string) {
    const [{ data: branding }, { data: space }] = await Promise.all([
        admin.from('workspace_branding').select('display_name').eq('coach_id', coachId).maybeSingle(),
        admin.from('coaches').select('name').eq('id', coachId).maybeSingle(),
    ])
    return (branding?.display_name as string | null)?.trim() || (space?.name as string | null) || 'tu entrenador'
}

/** Propietario activo del espacio (o un admin si no hay), que es quien puede reactivar. */
async function workspaceOwner(admin: Admin, coachId: string, excludeUserId: string): Promise<LicenseContact | null> {
    const { data: managers } = await admin
        .from('coach_memberships')
        .select('user_id, role, created_at')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .in('role', ['owner', 'admin'])
        .neq('user_id', excludeUserId)
        .order('created_at', { ascending: true })
    const manager = (managers ?? []).find(row => row.role === 'owner') ?? managers?.[0]
    if (!manager) return null

    const { data: profile } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', manager.user_id)
        .maybeSingle()
    return { name: (profile?.full_name as string | null) ?? null, email: (profile?.email as string | null) ?? null }
}
