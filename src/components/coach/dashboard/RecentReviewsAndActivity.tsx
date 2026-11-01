import { Clock, FileText } from 'lucide-react'
import type { ActivityItem, RecentCheckin } from '@/data/dashboard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckinRow } from '@/components/coach/dashboard/CheckinRow'
import { ActivityFeed } from '@/components/coach/dashboard/ActivityFeed'

interface RecentReviewsAndActivityProps {
    recentCheckins: RecentCheckin[]
    activity: ActivityItem[]
    checkinsThisWeek: number
}

// En xl las dos tarjetas miden lo mismo: manda el historial de revisiones y la
// actividad rellena esa altura con scroll propio. En una columna, altura natural.
export function RecentReviewsAndActivity({ recentCheckins, activity, checkinsThisWeek }: RecentReviewsAndActivityProps) {
    return (
        <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
            <Card id="ultimas-revisiones" className="flex min-w-0 scroll-mt-24 flex-col overflow-hidden xl:min-h-[18rem]">
                <div className="flex shrink-0 items-center justify-between border-b p-4">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <h2 className="font-semibold">Últimas revisiones</h2>
                        {checkinsThisWeek > 0 && (
                            <Badge variant="secondary" className="whitespace-nowrap border-0 bg-muted/70">
                                {checkinsThisWeek}<span className="hidden sm:inline">&nbsp;recibida{checkinsThisWeek !== 1 ? 's' : ''}</span> esta semana
                            </Badge>
                        )}
                    </div>
                </div>
                {recentCheckins.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium">Aún no hay revisiones</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Cuando envíes revisiones a tus atletas aparecerán aquí con su estado.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/60">
                        {recentCheckins.map((checkin) => (
                            <CheckinRow key={checkin.id} checkin={checkin} />
                        ))}
                    </div>
                )}
            </Card>

            <Card className="relative min-w-0 overflow-hidden xl:min-h-[18rem]">
                <div className="flex flex-col xl:absolute xl:inset-0">
                    <div className="flex shrink-0 items-center justify-between border-b p-4">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            <h2 className="font-semibold">Actividad reciente</h2>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <ActivityFeed items={activity} />
                    </div>
                </div>
            </Card>
        </div>
    )
}
