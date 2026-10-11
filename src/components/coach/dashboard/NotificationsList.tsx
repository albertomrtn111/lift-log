'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle2, ChevronRight, FileText, Loader2, MessageSquare } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { completeCoachTaskAction } from '@/components/coach/calendar-actions'
import { cn } from '@/lib/utils'
import type { DashboardNotification } from '@/data/dashboard'

interface NotificationsListProps {
    notifications: DashboardNotification[]
    coachId: string
}

export function NotificationsList({ notifications, coachId }: NotificationsListProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    if (notifications.length === 0) {
        return (
            <div className="p-6 sm:p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Bell className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">Sin notificaciones recientes</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Aquí aparecerán mensajes nuevos, revisiones recibidas y tareas pendientes del día.
                </p>
            </div>
        )
    }

    return (
        <ul className="divide-y divide-border/60">
            {notifications.map((notification) => {
                const Icon =
                    notification.type === 'chat_message'
                        ? MessageSquare
                        : notification.type === 'coach_task'
                            ? Bell
                            : FileText
                const tone =
                    notification.type === 'chat_message'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : notification.type === 'coach_task'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-primary/10 text-primary'
                const typeLabel =
                    notification.type === 'chat_message'
                        ? 'Mensaje'
                        : notification.type === 'coach_task'
                            ? 'Tarea'
                            : 'Revisión'
                const timeAgo = formatDistanceToNow(new Date(notification.timestamp), {
                    addSuffix: true,
                    locale: es,
                })
                const isTask = notification.type === 'coach_task' && notification.task_id

                return (
                    <li key={notification.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-muted/40">
                        <Link
                            href={notification.href}
                            aria-label={`${notification.title}: ${notification.ctaLabel}`}
                            className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-foreground no-underline"
                        >
                            <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span className="font-medium">{typeLabel}</span>
                                    <span aria-hidden>·</span>
                                    <span>{timeAgo}</span>
                                </span>
                                <span className="mt-0.5 block truncate text-[15px] font-semibold leading-snug">{notification.title}</span>
                                {notification.preview && (
                                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{notification.preview}</span>
                                )}
                            </span>
                        </Link>

                        {isTask ? (
                            <button
                                type="button"
                                disabled={isPending}
                                aria-label="Marcar tarea como completada"
                                onClick={() => {
                                    startTransition(async () => {
                                        const result = await completeCoachTaskAction(notification.task_id!, coachId)
                                        if (!result.success) {
                                            toast.error(result.error || 'No se pudo completar la tarea.')
                                            return
                                        }

                                        toast.success('Tarea completada.')
                                        router.refresh()
                                    })
                                }}
                                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-success/10 hover:text-success disabled:opacity-60"
                            >
                                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Hecha
                            </button>
                        ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                        )}
                    </li>
                )
            })}
        </ul>
    )
}
