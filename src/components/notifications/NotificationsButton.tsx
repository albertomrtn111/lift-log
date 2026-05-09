'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Loader2, Megaphone, MessageSquare, Dumbbell, Apple, Pill } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useClientNotifications } from '@/hooks/useClientNotifications'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ClientNotification, NotificationType } from '@/data/notifications'

const TYPE_META: Record<NotificationType, { icon: React.ReactNode; color: string; label: string }> = {
    general:       { icon: <Megaphone className="h-4 w-4" />,    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',    label: 'General' },
    message:       { icon: <MessageSquare className="h-4 w-4" />, color: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400', label: 'Mensaje' },
    plan_updated:  { icon: <Dumbbell className="h-4 w-4" />,      color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400', label: 'Plan' },
    check_in:      { icon: <CheckCheck className="h-4 w-4" />,    color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',  label: 'Check-in' },
    macro_updated: { icon: <Apple className="h-4 w-4" />,         color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400',     label: 'Nutrición' },
    supplement:    { icon: <Pill className="h-4 w-4" />,          color: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400',     label: 'Suplemento' },
}

export function NotificationsButton() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useClientNotifications()

    const handleOpen = (v: boolean) => setOpen(v)

    return (
        <>
            {/* Botón campana */}
            <button
                onClick={() => setOpen(true)}
                aria-label="Notificaciones"
                className={cn(
                    'fixed top-[calc(var(--safe-area-top,0px)+10px)] right-[calc(2.25rem+1.75rem)] z-50',
                    'flex items-center justify-center w-9 h-9 rounded-full',
                    'ring-2 ring-border bg-background hover:ring-primary/50 transition-all',
                    open && 'ring-primary'
                )}
            >
                <Bell className="h-4 w-4 text-foreground" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none pointer-events-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Panel lateral */}
            <Sheet open={open} onOpenChange={handleOpen}>
                <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
                    <SheetHeader className="px-4 py-4 border-b flex-row items-center justify-between space-y-0">
                        <SheetTitle className="text-base flex items-center gap-2">
                            <Bell className="h-4 w-4" /> Notificaciones
                            {unreadCount > 0 && (
                                <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                                    {unreadCount}
                                </span>
                            )}
                        </SheetTitle>
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={markAllAsRead}
                            >
                                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                                Marcar todas
                            </Button>
                        )}
                    </SheetHeader>

                    <ScrollArea className="flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                    <Bell className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-medium">Sin notificaciones</p>
                                <p className="text-xs text-muted-foreground">
                                    Aquí aparecerán los avisos de tu entrenador.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {notifications.map(n => (
                                    <NotificationItem
                                        key={n.id}
                                        notification={n}
                                        onRead={markAsRead}
                                        onNavigate={(url) => {
                                            setOpen(false)
                                            router.push(url)
                                        }}
                                    />
                                ))}
                            </ul>
                        )}
                    </ScrollArea>
                </SheetContent>
            </Sheet>
        </>
    )
}

function NotificationItem({
    notification: n,
    onRead,
    onNavigate,
}: {
    notification: ClientNotification
    onRead: (id: string) => void
    onNavigate: (url: string) => void
}) {
    const meta = TYPE_META[n.type] ?? TYPE_META.general

    const handleClick = () => {
        if (!n.is_read) onRead(n.id)
        if (n.url) onNavigate(n.url)
    }

    return (
        <li
            onClick={handleClick}
            className={cn(
                'flex gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-muted/40',
                !n.is_read && 'bg-primary/5 hover:bg-primary/10'
            )}
        >
            {/* Icono de tipo */}
            <div className={cn('mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center', meta.color)}>
                {meta.icon}
            </div>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm leading-snug', !n.is_read ? 'font-semibold' : 'font-medium')}>
                        {n.title}
                    </p>
                    {!n.is_read && (
                        <span className="mt-1 shrink-0 w-2 h-2 rounded-full bg-primary" />
                    )}
                </div>
                {n.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                )}
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                </p>
            </div>
        </li>
    )
}
