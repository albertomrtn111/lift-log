import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function getSupabaseEnv() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            'Missing Supabase environment variables. Please check your .env.local file contains:\n' +
            '- NEXT_PUBLIC_SUPABASE_URL\n' +
            '- NEXT_PUBLIC_SUPABASE_ANON_KEY'
        )
    }
    return { supabaseUrl, supabaseAnonKey }
}

export function createClient() {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

/**
 * Cliente solo para pedir enlaces por email (recuperar contraseña).
 *
 * El cliente normal usa PKCE: el enlace solo funciona en el navegador que lo
 * pidió, y falla si se pide desde la app instalada y se abre desde Gmail.
 * Con el flujo implícito el enlace trae la sesión en el #hash (como las
 * invitaciones) y /auth/callback la recoge en cualquier navegador.
 */
export function createEmailLinkClient() {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
    return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            flowType: 'implicit',
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'sb-email-link',
        },
    })
}
