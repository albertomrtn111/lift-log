import 'server-only'

import { randomBytes } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailIlikePattern, initialPasswordPlan, normalizeEmail, pickAccountForEmail, throwawayPassword } from './account-access-rules.js'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Cuenta de Auth con ese email, si existe.
 *
 * La API admin no busca por email: se buscan los perfiles (cada cuenta tiene el
 * suyo desde que se crea, con su email; handle_new_auth_user) y se comprueba en
 * Auth que el email coincide. Lanza un error si no se puede comprobar: quien
 * llama no debe mandar un enlace a ciegas.
 */
export async function findAuthAccountByEmail(admin: AdminClient, email: string): Promise<User | null> {
    const target = normalizeEmail(email)
    if (!target) return null

    const { data: profiles, error } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', emailIlikePattern(target))
        .limit(10)
    if (error) throw new Error(`No se pudo comprobar si el email tiene cuenta: ${error.message}`)

    const accounts: User[] = []
    for (const profile of profiles ?? []) {
        if (normalizeEmail(profile.email as string | null) !== target) continue
        const { data, error: userError } = await admin.auth.admin.getUserById(profile.id as string)
        if (userError) {
            if (userError.status === 404) continue
            throw new Error(`No se pudo comprobar la cuenta: ${userError.message}`)
        }
        if (data.user) accounts.push(data.user)
    }
    return (pickAccountForEmail(accounts, target) as User | null) ?? null
}

/**
 * Pone a la cuenta una contraseña aleatoria que no se entrega a nadie. Supabase
 * cierra además sus sesiones y anula los enlaces que tuviera pendientes.
 */
export async function replaceWithThrowawayPassword(admin: AdminClient, userId: string): Promise<void> {
    const { error } = await admin.auth.admin.updateUserById(userId, { password: throwawayPassword(randomBytes(32)) })
    if (error) throw new Error(`No se pudo preparar la cuenta para la invitación: ${error.message}`)
}

/**
 * Alta con contraseña inicial cuando el email ya tiene cuenta: si está sin
 * confirmar, se queda con la contraseña del coach y confirmada, igual que si
 * se creara ahora (al confirmarse, la base enlaza la ficha). Devuelve su id, o
 * null si la cuenta no existe o ya está confirmada (esa no se toca).
 */
export async function adoptUnconfirmedAccount(
    admin: AdminClient,
    email: string,
    password: string,
    fullName?: string | null,
): Promise<string | null> {
    const account = await findAuthAccountByEmail(admin, email)
    if (initialPasswordPlan(account) !== 'set_password_and_confirm' || !account) return null
    const { error } = await admin.auth.admin.updateUserById(account.id, {
        password,
        email_confirm: true,
        ...(fullName ? { user_metadata: { full_name: fullName } } : {}),
    })
    if (error) throw new Error(`No se pudo activar la cuenta existente: ${error.message}`)
    return account.id
}
