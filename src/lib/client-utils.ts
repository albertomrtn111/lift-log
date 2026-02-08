/**
 * Utilidades para la resolución segura de identidad de clientes.
 * Maneja los casos donde full_name puede ser null o undefined.
 */

interface ClientIdentitySource {
    full_name?: string | null
    email?: string | null
}

interface ClientDisplayIdentity {
    displayName: string
    initials: string
}

/**
 * Obtiene el nombre para mostrar y las iniciales de un cliente de forma segura.
 * Aplica fallbacks: full_name > email (antes de @) > "Cliente"
 */
export function getClientDisplayIdentity(client: ClientIdentitySource): ClientDisplayIdentity {
    // Prioridad de nombre: full_name > email (local part) > "Cliente"
    let displayName = 'Cliente'
    if (client.full_name && client.full_name.trim()) {
        displayName = client.full_name.trim()
    } else if (client.email && client.email.trim()) {
        displayName = client.email.split('@')[0]
    }

    // Generar iniciales de forma segura
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('') || 'C'

    return { displayName, initials }
}

/**
 * Versión simplificada que solo devuelve las iniciales.
 * Útil para avatares.
 */
export function getClientInitials(client: ClientIdentitySource): string {
    return getClientDisplayIdentity(client).initials
}

/**
 * Versión simplificada que solo devuelve el nombre para mostrar.
 */
export function getClientDisplayName(client: ClientIdentitySource): string {
    return getClientDisplayIdentity(client).displayName
}
