import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    AlertTriangle,
    ArrowRight,
    Bell,
    Calendar,
    Clock,
    FileText,
    LayoutDashboard,
    Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachDashboardData } from '@/data/dashboard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KPIStatCard } from '@/components/coach/dashboard/KPIStatCard'
import { NotificationsList } from '@/components/coach/dashboard/NotificationsList'
import { AttentionClientList } from '@/components/coach/dashboard/AttentionClientList'
import { CheckinRow } from '@/components/coach/dashboard/CheckinRow'
import { WeeklyOperationsCard } from '@/components/coach/dashboard/WeeklyOperationsCard'
import { ActivityFeed } from '@/components/coach/dashboard/ActivityFeed'

function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Buenos días'
    if (hour < 20) return 'Buenas tardes'
    return 'Buenas noches'
}

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const dashboard = await getCoachDashboardData(coachId, user.id)
    const todayFormatted = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
                <div className="px-4 py-6 lg:px-8">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                                <LayoutDashboard className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold">
                                    {getGreeting()}, {dashboard.coachName}
                                </h1>
                                <p className="text-sm text-muted-foreground capitalize">{todayFormatted}</p>
                            </div>
                        </div>

                        <Badge variant="secondary" className="hidden sm:inline-flex bg-muted/70">
                            {dashboard.kpis.pendingToday > 0 ? `${dashboard.kpis.pendingToday} foco${dashboard.kpis.pendingToday !== 1 ? 's' : ''} hoy` : 'Operativa estable'}
                        </Badge>
                    </div>
                </div>
            </header>

            <div className="space-y-6 px-4 pt-6 lg:px-8">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KPIStatCard
                        title="Pendientes hoy"
                        value={dashboard.kpis.pendingToday}
                        icon={<Clock className="h-5 w-5" />}
                        variant={dashboard.kpis.pendingToday > 0 ? 'warning' : 'default'}
                        subtitle={
                            dashboard.kpis.pendingReviews > 0
                                ? `${dashboard.kpis.pendingReviews} review${dashboard.kpis.pendingReviews !== 1 ? 's' : ''} abierta${dashboard.kpis.pendingReviews !== 1 ? 's' : ''}`
                                : 'Sin urgencias abiertas'
                        }
                        href="#notificaciones"
                    />
                    <KPIStatCard
                        title="Check-ins esta semana"
                        value={dashboard.kpis.checkinsThisWeek}
                        icon={<Calendar className="h-5 w-5" />}
                        variant="default"
                        subtitle="Enviados por clientes esta semana"
                        href="#ultimos-checkins"
                    />
                    <KPIStatCard
                        title="Requieren atención"
                        value={dashboard.kpis.requiresAttention}
                        icon={<AlertTriangle className="h-5 w-5" />}
                        variant={dashboard.kpis.requiresAttention > 0 ? 'danger' : 'muted'}
                        subtitle={
                            dashboard.kpis.highPriorityAttention > 0
                                ? `${dashboard.kpis.highPriorityAttention} caso${dashboard.kpis.highPriorityAttention !== 1 ? 's' : ''} prioritario${dashboard.kpis.highPriorityAttention !== 1 ? 's' : ''}`
                                : 'Sin incidencias críticas'
                        }
                        href="#requieren-atencion"
                    />
                    <KPIStatCard
                        title="Clientes activos"
                        value={dashboard.kpis.activeClients}
                        icon={<Users className="h-5 w-5" />}
                        variant="success"
                        subtitle={
                            dashboard.kpis.clientsWithoutProgram > 0
                                ? `${dashboard.kpis.clientsWithoutProgram} sin programa activo`
                                : dashboard.kpis.inactiveClients > 0
                                    ? `${dashboard.kpis.inactiveClients} inactivos`
                                    : 'Todos con seguimiento activo'
                        }
                        href="/coach/members"
                    />
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
                    <Card id="notificaciones" className="overflow-hidden">
                        <div className="flex items-center justify-between border-b p-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Bell className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Notificaciones</h2>
                                    {dashboard.notifications.length > 0 && (
                                        <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                                            {dashboard.notifications.length}
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Mensajes nuevos y check-ins recibidos recientemente.
                                </p>
                            </div>
                        </div>
                        <NotificationsList notifications={dashboard.notifications} />
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="border-b p-4">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-primary" />
                                <h2 className="font-semibold">Operativa de la semana</h2>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Carga de trabajo y próximos hitos para los siguientes días.
                            </p>
                        </div>
                        <WeeklyOperationsCard weeklyOperations={dashboard.weeklyOperations} />
                    </Card>
                </div>

                <Card id="requieren-atencion" className="overflow-hidden">
                    <div className="flex items-center justify-between border-b p-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                                <h2 className="font-semibold">Clientes que requieren atención</h2>
                                {dashboard.attentionClients.length > 0 && (
                                    <Badge variant="destructive">{dashboard.attentionClients.length}</Badge>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Misma lógica que el KPI superior: reviews pendientes, atraso, adherencia baja o clientes sin programa.
                            </p>
                        </div>
                    </div>
                    <AttentionClientList clients={dashboard.attentionClients} />
                </Card>

                <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                    <Card id="ultimos-checkins" className="overflow-hidden">
                        <div className="flex items-center justify-between border-b p-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Últimos check-ins recibidos</h2>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Historial reciente con estado de revisión y señales rápidas para priorizar.
                                </p>
                            </div>
                        </div>

                        {dashboard.recentCheckins.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="font-medium">Aún no hay check-ins recibidos</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Cuando entren formularios aparecerán aquí con su estado de revisión.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {dashboard.recentCheckins.map((checkin) => (
                                    <CheckinRow key={checkin.id} checkin={checkin} />
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="flex items-center justify-between border-b p-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <LayoutDashboard className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Actividad reciente</h2>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Qué ha pasado desde la última vez que abriste el panel.
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/coach/calendar">
                                    Ver agenda
                                    <ArrowRight className="ml-1 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                        <ActivityFeed items={dashboard.activity} />
                    </Card>
                </div>
            </div>
        </div>
    )
}
