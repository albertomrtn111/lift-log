'use client'

import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCoachNotifications } from './CoachNotificationsProvider'

/** Botón de la campana del coach: abre el panel de avisos y muestra los no leídos. */
export function CoachNotificationsBell({ className }: { className?: string }) {
    const context = useCoachNotifications()
    if (!context) return null

    const { unreadCount, openSheet } = context
    return (
        <button
            type="button"
            onClick={openSheet}
            aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
            className={cn(
                'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition-colors hover:bg-muted',
                className
            )}
        >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
            {unreadCount > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    )
}
