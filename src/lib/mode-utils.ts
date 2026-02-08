import type { UserRole } from '@/types/coach'

export type AppMode = 'client' | 'coach'
export type UserModeResolution = 'client' | 'coach' | 'both' | 'none'

export const APP_MODE_COOKIE = 'app_mode'
export const LAST_MODE_COOKIE = 'last_app_mode' // For persistence

/**
 * Get the default mode based on user role
 */
export function getDefaultMode(role: UserRole): AppMode | null {
    switch (role) {
        case 'coach':
            return 'coach'
        case 'client':
            return 'client'
        case 'both':
            return null // User must choose or use last chosen
        case 'none':
            return null
    }
}

/**
 * Get the redirect path for a given mode
 */
export function getModeRedirectPath(mode: AppMode): string {
    return mode === 'coach' ? '/coach/dashboard' : '/routine'
}

/**
 * Check if user can switch modes (has both roles)
 */
export function canSwitchMode(role: UserRole): boolean {
    return role === 'both'
}
