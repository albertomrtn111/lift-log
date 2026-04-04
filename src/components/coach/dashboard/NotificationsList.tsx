'use client'

import Link from 'next/link'
import { ArrowRight, Bell, FileText, MessageSquare } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DashboardNotification } from '@/data/dashboard'

interface NotificationsListProps {
    notifications: DashboardNotification[]
}

export function NotificationsList({ notifications }: NotificationsListProps) {
    if (notifications.length === 0) {
        return (
            <div className="p-6 sm:p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Bell className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">Sin notificaciones recientes</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Aquí aparecerán mensajes nuevos y check-ins recibidos.
                </p>
            </div>
        )
    }

    return (
        <div className="divide-y">
            {notifications.map((notification) => {
                const Icon = notification.type === 'chat_message' ? MessageSquare : FileText
                const typeLabel = notification.type === 'chat_message' ? 'chat' : 'check-in'
                const timeAgo = formatDistanceToNow(new Date(notification.timestamp), {
                    addSuffix: true,
                    locale: es,
                })

                return (
                    <div
                        key={notification.id}
                        className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-foreground">{notification.title}</p>
                                    <Badge
                                        variant="outline"
                                        className="border-border text-xs text-muted-foreground"
                                    >
                                        {typeLabel}
                                    </Badge>
                                </div>
                                {notification.preview && (
                                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                                        {notification.preview}
                                    </p>
                                )}
                                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo}</p>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="shrink-0 self-start sm:self-center"
                        >
                            <Link href={notification.href}>
                                {notification.ctaLabel}
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                )
            })}
        </div>
    )
}
