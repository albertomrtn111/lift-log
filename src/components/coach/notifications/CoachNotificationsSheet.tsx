'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, CheckCheck, ChevronRight, ClipboardCheck, ListTodo, MessageSquare } from 'lucide-react'
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { CoachNotification, CoachNotificationCategory } from '@/data/coach-notifications'
import { useCoachNotifications } from './CoachNotificationsProvider'

type Filter = 'all' | 'reviews' | 'messages' | 'other'

const FILTERS: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: 'Todo' },
    { value: 'reviews', label: 'Revisiones' },
    { value: 'messages', label: 'Mensajes' },
    { value: 'other', label: 'Sistema' },
]

const CATEGORY_META: Record<CoachNotificationCategory, { icon: React.ElementType; tone: string; label: string }> = {
    reviews: { icon: ClipboardCheck, tone: 'bg-primary/10 text-primary', label: 'Revisión' },
    messages: { icon: MessageSquare, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'Mensaje' },
    tasks: { icon: ListTodo, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', label: 'Tarea' },
    system: { icon: Bell, tone: 'bg-muted text-muted-foreground', label: 'Sistema' },
}

function matchesFilter(notification: CoachNotification, filter: Filter) {
    if (filter === 'all') return true
    if (filter === 'other') return notification.category === 'tasks' || notification.category === 'system'
    return notification.category === filter
}

export function CoachNotificationsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const router = useRouter()
    const context = useCoachNotifications()
    const [filter, setFilter] = useState<Filter>('all')

    const notifications = context?.notifications ?? []
    const visible = useMemo(() => notifications.filter(n => matchesFilter(n, filter)), [notifications, filter])
    const groups = useMemo(() => groupByAge(visible), [visible])
    const unreadByFilter = useMemo(() => {
        const counts: Record<Filter, number> = { all: 0, reviews: 0, messages: 0, other: 0 }
        for (const n of notifications) {
            if (n.is_read) continue
            for (const f of FILTERS) if (matchesFilter(n, f.value)) counts[f.value] += 1
        }
        return counts
    }, [notifications])

    if (!context) return null

    const handleOpen = (notification: CoachNotification) => {
        if (!notification.is_read) context.markRead([notification.id])
        if (notification.url) {
            onOpenChange(false)
            router.push(notification.url)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="shrink-0 space-y-0 border-b border-border/60 px-4 pb-3 pr-16 pt-[calc(env(safe-area-inset-top,0px)+1rem)] text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avisos</p>
                    <SheetTitle className="text-2xl font-bold leading-tight tracking-tight">Notificaciones</SheetTitle>
                    <SheetDescription className="sr-only">Revisiones, mensajes y avisos del sistema</SheetDescription>
                </SheetHeader>

                <div className="shrink-0 border-b border-border/60 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div role="tablist" aria-label="Filtrar avisos" className="flex flex-1 gap-1 overflow-x-auto rounded-full bg-muted p-1">
                            {FILTERS.map(f => (
                                <button
                                    key={f.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={filter === f.value}
                                    onClick={() => setFilter(f.value)}
                                    className={cn(
                                        'flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors',
                                        filter === f.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {f.label}
                                    {unreadByFilter[f.value] > 0 && (
                                        <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">{unreadByFilter[f.value]}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                        {context.unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={context.markAllRead}
                                className="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Leer todo
                            </button>
                        )}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
                    {context.loading ? (
                        <div className="space-y-2 pt-4" aria-label="Cargando notificaciones">
                            {Array.from({ length: 4 }, (_, index) => (
                                <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted" />
                            ))}
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                <BellOff className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-semibold">Sin avisos</p>
                            <p className="mt-1 max-w-[18rem] text-xs text-muted-foreground">
                                Aquí aparecerán las revisiones que te respondan, los mensajes de tus atletas y tu resumen diario.
                            </p>
                        </div>
                    ) : (
                        groups.map(group => (
                            <section key={group.label} className="pt-4">
                                <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h3>
                                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                                    {group.items.map(n => {
                                        const meta = CATEGORY_META[n.category] ?? CATEGORY_META.system
                                        const Icon = meta.icon
                                        return (
                                            <li key={n.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpen(n)}
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
                                                            <span>{formatRelative(n.updated_at)}</span>
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
                                    })}
                                </ul>
                            </section>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
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
    if (days < 7) return format(date, 'EEEE, HH:mm', { locale: es })
    return format(date, 'd MMM', { locale: es })
}

function groupByAge(items: CoachNotification[]) {
    const order = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'] as const
    const buckets = new Map<string, CoachNotification[]>()
    for (const item of items) {
        const days = differenceInCalendarDays(new Date(), new Date(item.updated_at))
        const label = days <= 0 ? 'Hoy' : days === 1 ? 'Ayer' : days < 7 ? 'Esta semana' : 'Anteriores'
        buckets.set(label, [...(buckets.get(label) ?? []), item])
    }
    return order.filter(label => buckets.has(label)).map(label => ({ label, items: buckets.get(label)! }))
}
