'use client'

import { useAppMode } from '@/hooks/use-app-mode'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight, Briefcase, User } from 'lucide-react'
import type { UserRole } from '@/types/coach'
import type { AppMode } from '@/lib/mode-utils'

interface ModeSwitchProps {
    role: UserRole
    currentMode?: AppMode
    variant?: 'button' | 'toggle' | 'compact'
}

/**
 * Mode switch component for users with both client and coach roles
 * Only renders if the user can switch modes
 */
export function ModeSwitch({ role, currentMode, variant = 'button' }: ModeSwitchProps) {
    const { mode, switchMode, canSwitch } = useAppMode({ role, initialMode: currentMode })

    // Don't render if user can't switch
    if (!canSwitch) return null

    const isCoachMode = mode === 'coach'
    const targetMode = isCoachMode ? 'Cliente' : 'Coach'
    const TargetIcon = isCoachMode ? User : Briefcase

    if (variant === 'compact') {
        return (
            <Button
                variant="ghost"
                size="sm"
                onClick={switchMode}
                className="gap-2"
                title={`Cambiar a modo ${targetMode}`}
            >
                <ArrowLeftRight className="h-4 w-4" />
            </Button>
        )
    }

    if (variant === 'toggle') {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={switchMode}
                className="gap-2"
            >
                <TargetIcon className="h-4 w-4" />
                Modo {targetMode}
            </Button>
        )
    }

    return (
        <Button
            variant="outline"
            onClick={switchMode}
            className="gap-2"
        >
            <ArrowLeftRight className="h-4 w-4" />
            Cambiar a {targetMode}
        </Button>
    )
}
