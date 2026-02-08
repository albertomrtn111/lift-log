'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/types/coach'
import { APP_MODE_COOKIE, LAST_MODE_COOKIE, type AppMode, getModeRedirectPath, canSwitchMode } from '@/lib/mode-utils'

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? match[2] : null
}

function setCookie(name: string, value: string, days: number = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
}

interface UseAppModeOptions {
    role: UserRole
    initialMode?: AppMode | null
}

interface UseAppModeReturn {
    mode: AppMode | null
    setMode: (mode: AppMode) => void
    switchMode: () => void
    canSwitch: boolean
}

/**
 * Client hook for managing app mode (client/coach)
 */
export function useAppMode({ role, initialMode }: UseAppModeOptions): UseAppModeReturn {
    const router = useRouter()
    const [mode, setModeState] = useState<AppMode | null>(initialMode ?? null)
    const canSwitch = canSwitchMode(role)

    // Initialize from cookie on mount
    useEffect(() => {
        const cookieMode = getCookie(APP_MODE_COOKIE) as AppMode | null
        if (cookieMode && (cookieMode === 'client' || cookieMode === 'coach')) {
            setModeState(cookieMode)
        }
    }, [])

    const setMode = useCallback((newMode: AppMode) => {
        setCookie(APP_MODE_COOKIE, newMode)
        setCookie(LAST_MODE_COOKIE, newMode) // Persist sticky preference
        setModeState(newMode)
        // Navigate to the appropriate area
        router.push(getModeRedirectPath(newMode))
    }, [router])

    const switchMode = useCallback(() => {
        if (!canSwitch || !mode) return
        const newMode: AppMode = mode === 'coach' ? 'client' : 'coach'
        setMode(newMode)
    }, [canSwitch, mode, setMode])

    return {
        mode,
        setMode,
        switchMode,
        canSwitch,
    }
}
