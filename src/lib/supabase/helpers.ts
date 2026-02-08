import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ensures that a profile row exists for the current authenticated user.
 * This is required because many tables have foreign keys to profiles(id)
 * and RLS policies often check that created_by matches auth.uid().
 * 
 * Call this before any insert that might require a profile to exist.
 */
export async function ensureProfileExists(
    supabase: SupabaseClient
): Promise<{ userId: string; email: string | null } | null> {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        console.error('[ensureProfile] No authenticated user:', authError)
        return null
    }

    // Upsert profile - this ensures a row exists without failing
    const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'id',
            ignoreDuplicates: false, // Update if exists
        })

    if (upsertError) {
        // Log but don't throw - profile might already exist and upsert might fail
        // for other reasons but inserts should still work
        console.warn('[ensureProfile] Could not upsert profile (may already exist):', upsertError)
    }

    return {
        userId: user.id,
        email: user.email || null,
    }
}

/**
 * Get the current user ID from auth.
 * Lightweight version that doesn't upsert profile.
 */
export async function getCurrentUserId(
    supabase: SupabaseClient
): Promise<string | null> {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        console.error('[getCurrentUserId] No authenticated user:', error)
        return null
    }

    return user.id
}

/**
 * Format a Supabase error for display in a toast.
 * Extracts the most useful information from the error object.
 */
export function formatSupabaseError(error: unknown): string {
    if (!error) return 'Error desconocido'

    // Check if it's a Supabase error with message
    if (typeof error === 'object' && error !== null) {
        const err = error as {
            message?: string
            details?: string
            hint?: string
            code?: string
        }

        // Build error message with available info
        let message = err.message || 'Error desconocido'

        // Common RLS error - make it user-friendly
        if (message.includes('row-level security') || err.code === '42501') {
            message = 'No tienes permisos para realizar esta acción'
        }

        // Add hint if available and not redundant
        if (err.hint && !message.includes(err.hint)) {
            message += ` (${err.hint})`
        }

        return message
    }

    return String(error)
}

/**
 * Format a Supabase error with FULL details for debugging (dev only).
 * Shows code, message, details, hint - everything available.
 */
export function formatSupabaseErrorVerbose(error: unknown, context?: { table?: string; operation?: string }): string {
    if (!error) return 'Error desconocido'

    if (typeof error === 'object' && error !== null) {
        const err = error as {
            message?: string
            details?: string
            hint?: string
            code?: string
        }

        const parts: string[] = []

        if (context?.table) parts.push(`Table: ${context.table}`)
        if (context?.operation) parts.push(`Op: ${context.operation}`)
        if (err.code) parts.push(`Code: ${err.code}`)
        if (err.message) parts.push(`Msg: ${err.message}`)
        if (err.details) parts.push(`Details: ${err.details}`)
        if (err.hint) parts.push(`Hint: ${err.hint}`)

        return parts.join(' | ')
    }

    return String(error)
}

/**
 * Check if an error is an RLS (Row-Level Security) permission error.
 */
export function isRlsError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false

    const err = error as { code?: string; message?: string }

    // 42501 = insufficient_privilege (RLS denies access)
    if (err.code === '42501') return true

    // Also check message keywords
    const msg = err.message?.toLowerCase() || ''
    return (
        msg.includes('row-level security') ||
        msg.includes('permission denied') ||
        msg.includes('violates row-level security policy')
    )
}

/**
 * Log a Supabase error with full details for debugging.
 */
export function logSupabaseError(context: string, error: unknown, payload?: Record<string, unknown>): void {
    console.error(`[${context}] Error:`, {
        error,
        payload: payload ? sanitizePayload(payload) : undefined,
        timestamp: new Date().toISOString(),
    })
}

/**
 * Sanitize payload for logging (remove sensitive data)
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...payload }
    // Remove any potentially sensitive fields
    const sensitiveKeys = ['password', 'token', 'secret', 'key']
    for (const key of sensitiveKeys) {
        if (key in sanitized) {
            sanitized[key] = '[REDACTED]'
        }
    }
    return sanitized
}
