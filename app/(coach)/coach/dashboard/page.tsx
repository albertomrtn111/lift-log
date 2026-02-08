import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import {
    getDashboardKPIs,
    getDueTodayClients,
    getDueSoonClients,
    getAtRiskClients,
    getRecentCheckins
} from '@/data/dashboard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    LayoutDashboard,
    Clock,
    Calendar,
    AlertTriangle,
    Users,
    ArrowRight,
    FileText
} from 'lucide-react'
import Link from 'next/link'
import { KPIStatCard } from '@/components/coach/dashboard/KPIStatCard'
import { ClientRow } from '@/components/coach/dashboard/ClientRow'
import { RiskCard } from '@/components/coach/dashboard/RiskCard'
import { CheckinRow } from '@/components/coach/dashboard/CheckinRow'

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    // Fetch all dashboard data in parallel
    const [kpis, dueTodayClients, dueSoonClients, atRiskClients, recentCheckins] = await Promise.all([
        getDashboardKPIs(coachId),
        getDueTodayClients(coachId),
        getDueSoonClients(coachId, 7),
        getAtRiskClients(coachId),
        getRecentCheckins(coachId, 10),
    ])

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <LayoutDashboard className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Dashboard</h1>
                            <p className="text-sm text-muted-foreground">Tu panel operativo</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6 space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPIStatCard
                        title="Pendientes hoy"
                        value={kpis.pendingToday}
                        icon={<Clock className="h-5 w-5" />}
                        variant={kpis.pendingToday > 0 ? 'warning' : 'default'}
                    />
                    <KPIStatCard
                        title="Esta semana"
                        value={kpis.pendingWeek}
                        icon={<Calendar className="h-5 w-5" />}
                        variant="default"
                    />
                    <KPIStatCard
                        title="En riesgo"
                        value={kpis.atRisk}
                        icon={<AlertTriangle className="h-5 w-5" />}
                        variant={kpis.atRisk > 0 ? 'danger' : 'default'}
                    />
                    <KPIStatCard
                        title="Clientes activos"
                        value={kpis.totalActive}
                        icon={<Users className="h-5 w-5" />}
                        variant="success"
                        subtitle={kpis.totalInactive > 0 ? `${kpis.totalInactive} inactivos` : undefined}
                    />
                </div>

                {/* Acciones Hoy */}
                <Card>
                    <div className="flex items-center justify-between p-4 border-b">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-warning" />
                            <h2 className="font-semibold">Acciones hoy</h2>
                            {dueTodayClients.length > 0 && (
                                <Badge variant="secondary" className="bg-warning/10 text-warning border-0">
                                    {dueTodayClients.length}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {dueTodayClients.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                                <Clock className="h-6 w-6 text-success" />
                            </div>
                            <p className="font-medium">¡Todo al día!</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                No hay check-ins pendientes para hoy
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {dueTodayClients.map(client => (
                                <ClientRow key={client.id} client={client} />
                            ))}
                        </div>
                    )}
                </Card>

                {/* Esta Semana */}
                <Card>
                    <div className="flex items-center justify-between p-4 border-b">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            <h2 className="font-semibold">Esta semana</h2>
                            {dueSoonClients.length > 0 && (
                                <Badge variant="secondary">{dueSoonClients.length}</Badge>
                            )}
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/coach/calendar">
                                Ver calendario
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                        </Button>
                    </div>

                    {dueSoonClients.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                            No hay check-ins programados para los próximos 7 días
                        </div>
                    ) : (
                        <div className="divide-y">
                            {dueSoonClients.slice(0, 5).map(client => (
                                <ClientRow key={client.id} client={client} showFrequency={false} />
                            ))}
                            {dueSoonClients.length > 5 && (
                                <div className="p-3 text-center">
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href="/coach/calendar">
                                            Ver {dueSoonClients.length - 5} más
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* En Riesgo */}
                {atRiskClients.length > 0 && (
                    <Card>
                        <div className="flex items-center gap-2 p-4 border-b">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            <h2 className="font-semibold">En riesgo</h2>
                            <Badge variant="destructive">{atRiskClients.length}</Badge>
                        </div>
                        <div className="p-4 grid gap-3 sm:grid-cols-2">
                            {atRiskClients.map(client => (
                                <RiskCard key={client.id} client={client} />
                            ))}
                        </div>
                    </Card>
                )}

                {/* Últimos Check-ins */}
                <Card>
                    <div className="flex items-center justify-between p-4 border-b">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            <h2 className="font-semibold">Últimos check-ins recibidos</h2>
                        </div>
                    </div>

                    {recentCheckins.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                                <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="font-medium">Sin check-ins</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Aún no has recibido check-ins de tus clientes
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {recentCheckins.map(checkin => (
                                <CheckinRow key={checkin.id} checkin={checkin} />
                            ))}
                        </div>
                    )}
                </Card>

                {/* Quick Summary */}
                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="font-semibold">{kpis.totalActive}</span>
                                <span className="text-muted-foreground ml-1">activos</span>
                                {kpis.totalInactive > 0 && (
                                    <>
                                        <span className="text-muted-foreground mx-2">·</span>
                                        <span className="text-muted-foreground">{kpis.totalInactive} inactivos</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/coach/members">
                                Ir a Miembros
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    )
}
