'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Apple, Bell, BellOff, CheckCheck, ChevronRight, Dumbbell, Megaphone, MessageCircle, Pill } from 'lucide-react'
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useClientNotifications } from '@/hooks/useClientNotifications'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'
import type { ClientNotification, NotificationType } from '@/data/notifications'

const TYPE_META: Record<NotificationType, { icon: React.ElementType; tone: string; label: string }> = {
    general:       { icon: Megaphone,     tone: 'bg-primary/10 text-primary',                                   label: 'Aviso' },
    message:       { icon: MessageCircle, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',     label: 'Mensaje' },
    plan_updated:  { icon: Dumbbell,      tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',        label: 'Plan' },
    check_in:      { icon: CheckCheck,    tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',           label: 'Revisión' },
    macro_updated: { icon: Apple,         tone: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',              label: 'Nutrición' },
    supplement:    { icon: Pill,          tone: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',              label: 'Suplementos' },
}

type Filter = 'all' | 'unread'

export function NotificationsButton() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState<Filter>('all')
    const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useClientNotifications()

    const visible = filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications
    const groups = useMemo(() => groupByAge(visible), [visible])

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
                className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors',
                    'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    open && 'bg-muted'
                )}
            >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                    <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-sm">
                    <SheetHeader className="shrink-0 space-y-0 border-b border-border/60 px-4 pb-3 pr-16 pt-[calc(env(safe-area-inset-top,0px)+1rem)] text-left">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avisos</p>
                        <SheetTitle className="text-2xl font-bold leading-tight tracking-tight">Notificaciones</SheetTitle>
                        <SheetDescription className="sr-only">Avisos de tu entrenador y de tu plan</SheetDescription>
                    </SheetHeader>

                    <div className="shrink-0 border-b border-border/60 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <ClientTabSwitcher
                                className="flex-1"
                                value={filter}
                                onValueChange={setFilter}
                                options={[
                                    { value: 'all', label: 'Todas' },
                                    { value: 'unread', label: unreadCount > 0 ? `Sin leer · ${unreadCount}` : 'Sin leer' },
                                ]}
                            />
                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllAsRead}
                                    className="flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Leer todo
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
                        {loading ? (
                            <NotificationsSkeleton />
                        ) : visible.length === 0 ? (
                            <div className="flex flex-col items-center px-6 py-16 text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                    {filter === 'unread' ? <CheckCheck className="h-6 w-6 text-muted-foreground" /> : <BellOff className="h-6 w-6 text-muted-foreground" />}
                                </div>
                                <p className="text-sm font-semibold">{filter === 'unread' ? 'Estás al día' : 'Sin notificaciones'}</p>
                                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                                    {filter === 'unread'
                                        ? 'No tienes avisos pendientes de leer.'
                                        : 'Aquí aparecerán los avisos de tu entrenador y los cambios en tu plan.'}
                                </p>
                            </div>
                        ) : (
                            groups.map(group => (
                                <section key={group.label} className="pt-4">
                                    <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {group.label}
                                    </h3>
                                    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                                        {group.items.map(notification => (
                                            <NotificationItem
                                                key={notification.id}
                                                notification={notification}
                                                onRead={markAsRead}
                                                onNavigate={(url) => {
                                                    setOpen(false)
                                                    router.push(url)
                                                }}
                                            />
                                        ))}
                                    </ul>
                                </section>
                            ))
                        )}
                    </div>
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
    const Icon = meta.icon

    const handleClick = () => {
        if (!n.is_read) onRead(n.id)
        if (n.url) onNavigate(n.url)
    }

    return (
        <li>
            <button
                type="button"
                onClick={handleClick}
                className={cn(
                    'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50',
                    !n.is_read && 'bg-primary/[0.04]'
                )}
            >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', meta.tone)}>
                    <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium">{meta.label}</span>
                        <span aria-hidden>·</span>
                        <span>{formatRelative(n.created_at)}</span>
                    </span>
                    <span className={cn('mt-0.5 block text-sm leading-snug', !n.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                        {n.title}
                    </span>
                    {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>
                    )}
                </span>
                <span className="flex shrink-0 flex-col items-center gap-2 self-stretch pt-1">
                    {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Sin leer" />}
                    {n.url && <ChevronRight className="mt-auto h-4 w-4 text-muted-foreground/60" />}
                </span>
            </button>
        </li>
    )
}

function NotificationsSkeleton() {
    return (
        <div className="space-y-2 pt-4" aria-label="Cargando notificaciones">
            {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-start gap-3 rounded-2xl border border-border/60 p-3.5">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-muted" />
                    <div className="flex-1 space-y-2">
                        <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function formatRelative(dateStr: string) {
    const date = new Date(dateStr)
    const days = differenceInCalendarDays(new Date(), date)
    if (days === 0) {
        const minutes = (Date.now() - date.getTime()) / 60000
        if (minutes < 1) return 'ahora'
        return `hace ${formatDistanceToNowStrict(date, { locale: es })}`
    }
    if (days === 1) return `ayer, ${format(date, 'HH:mm')}`
    if (days < 7) return format(date, "EEEE, HH:mm", { locale: es })
    return format(date, "d MMM", { locale: es })
}

function groupByAge(items: ClientNotification[]) {
    const order = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'] as const
    const buckets = new Map<string, ClientNotification[]>()
    for (const item of items) {
        const days = differenceInCalendarDays(new Date(), new Date(item.created_at))
        const label = days <= 0 ? 'Hoy' : days === 1 ? 'Ayer' : days < 7 ? 'Esta semana' : 'Anteriores'
        buckets.set(label, [...(buckets.get(label) ?? []), item])
    }
    return order.filter(label => buckets.has(label)).map(label => ({ label, items: buckets.get(label)! }))
}
