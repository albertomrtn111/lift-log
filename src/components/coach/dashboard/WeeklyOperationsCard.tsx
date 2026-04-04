'use client'

import Link from 'next/link'
import { ArrowRight, CalendarRange, Clock3, Dumbbell, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { WeeklyOperations } from '@/data/dashboard'
import { getClientDisplayIdentity } from '@/lib/client-utils'

interface WeeklyOperationsCardProps {
    weeklyOperations: WeeklyOperations
}

export function WeeklyOperationsCard({ weeklyOperations }: WeeklyOperationsCardProps) {
    return (
        <div className="p-4 sm:p-5 space-y-5">
            <div>
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <p className="font-medium">Próximos hitos</p>
                        <p className="text-sm text-muted-foreground">Qué viene en los próximos días</p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/coach/calendar">
                            Calendario
                            <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                    </Button>
                </div>

                {weeklyOperations.dueThisWeek.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        No hay check-ins programados en los próximos 7 días.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {weeklyOperations.dueThisWeek.slice(0, 5).map((client) => {
                            const { displayName } = getClientDisplayIdentity(client)
                            return (
                                <Link
                                    key={client.id}
                                    href={`/coach/clients?client=${client.id}`}
                                    className="flex items-center justify-between rounded-2xl border p-3 transition-colors hover:bg-muted/20 no-underline text-foreground"
                                >
                                    <div>
                                        <p className="font-medium">{displayName}</p>
                                        <p className="text-sm text-muted-foreground">Próximo check-in</p>
                                    </div>
                                    <Badge variant="secondary">
                                        {client.daysUntilCheckin === 1 ? 'Mañana' : `${client.daysUntilCheckin} días`}
                                    </Badge>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
