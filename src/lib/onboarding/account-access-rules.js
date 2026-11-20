/**
 * Acceso de un email que puede tener ya cuenta en Supabase Auth (invitaciones
 * de atleta y de equipo, alta con contraseña inicial). Lógica pura, testeada
 * en scripts/account-access-rules.test.mjs.
 *
 * Una cuenta sin confirmar no tiene dueño verificado: antes de mandar el
 * enlace se le pone una contraseña aleatoria, así solo se entra con el enlace
 * que llega a ese email.
 *
 * @typedef {{ id: string, email?: string | null, email_confirmed_at?: string | null }} AuthAccount
 *
 * @typedef {'invite' | 'reset_then_invite' | 'magic_link'} AccessLinkPlan
 *
 * @typedef {{
 *   id: string
 *   auth_user_id?: string | null
 *   user_id?: string | null
 *   status?: string | null
 *   is_sample?: boolean | null
 * }} InvitedClient
 */

/**
 * @param {string | null | undefined} email
 * @returns {string | null}
 */
export function normalizeEmail(email) {
    const value = typeof email === 'string' ? email.trim().toLowerCase() : ''
    return value || null
}

/**
 * Patrón para `ilike` que equivale a "igual sin mayúsculas" (escapa % _ y \).
 * @param {string} email
 */
export function emailIlikePattern(email) {
    return email.replace(/[\\%_]/g, char => `\\${char}`)
}

/**
 * Supabase responde así cuando el email ya tiene cuenta (createUser, invite).
 * @param {string | null | undefined} message
 */
export function isAlreadyRegisteredMessage(message) {
    const text = (message ?? '').toLowerCase()
    return text.includes('already') || text.includes('registered') || text.includes('exists')
}

/**
 * De las cuentas candidatas, la que tiene exactamente ese email en Auth.
 * @param {AuthAccount[]} accounts
 * @param {string} email
 * @returns {AuthAccount | null}
 */
export function pickAccountForEmail(accounts, email) {
    const target = normalizeEmail(email)
    if (!target) return null
    return accounts.find(account => account && normalizeEmail(account.email) === target) ?? null
}

/**
 * @param {AuthAccount | null | undefined} account
 */
export function isConfirmedAccount(account) {
    return Boolean(account?.email_confirmed_at)
}

/**
 * Cómo se genera el enlace de acceso:
 * - sin cuenta: invitación (la crea, sin contraseña);
 * - cuenta sin confirmar: contraseña aleatoria y después invitación;
 * - cuenta confirmada: enlace mágico (es de quien tiene el email).
 * @param {AuthAccount | null | undefined} account
 * @returns {AccessLinkPlan}
 */
export function accessLinkPlan(account) {
    if (!account) return 'invite'
    return isConfirmedAccount(account) ? 'magic_link' : 'reset_then_invite'
}

/**
 * Alta con contraseña inicial cuando Auth dice que el email ya tiene cuenta:
 * si está sin confirmar se queda con la contraseña del coach y confirmada,
 * igual que si se hubiera creado ahora; si está confirmada no se toca.
 * @param {AuthAccount | null | undefined} account
 * @returns {'set_password_and_confirm' | 'keep_existing'}
 */
export function initialPasswordPlan(account) {
    return account && !isConfirmedAccount(account) ? 'set_password_and_confirm' : 'keep_existing'
}

/**
 * Si la ficha invitada se enlaza ya con la cuenta del enlace (como hacía el
 * disparador al crear la cuenta), para que el coach pueda prepararle el plan
 * mientras el atleta no entra. Solo con una cuenta sin confirmar cuya
 * contraseña no conoce nadie (recién creada por la invitación o cambiada por
 * una aleatoria) y sin dejarla con dos fichas activas.
 * @param {{
 *   accountId: string | null | undefined
 *   accountConfirmed: boolean
 *   client: InvitedClient
 *   otherActiveClients: number
 * }} input
 */
export function canLinkInvitedClient({ accountId, accountConfirmed, client, otherActiveClients }) {
    if (!accountId || accountConfirmed) return false
    if (!client || client.is_sample || client.auth_user_id) return false
    if (client.user_id && client.user_id !== accountId) return false
    return client.status !== 'active' || otherActiveClients === 0
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/**
 * Contraseña que no se entrega a nadie. Cumple cualquier política de Supabase
 * (minúscula, mayúscula, número y símbolo) y no pasa de 72 caracteres.
 * @param {Uint8Array} randomBytes al menos 24 bytes aleatorios
 */
export function throwawayPassword(randomBytes) {
    if (!randomBytes || randomBytes.length < 24) throw new Error('Hacen falta al menos 24 bytes aleatorios')
    let body = ''
    for (const byte of randomBytes.slice(0, 64)) body += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
    return `${body}-Aa9`
}
