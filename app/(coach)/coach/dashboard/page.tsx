import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    AlertTriangle,
    ArrowRight,
    Bell,
    CalendarDays,
    CheckCircle2,
    Clock,
    FileText,
    Inbox,
    Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachDashboardData } from '@/data/dashboard'
import { getUpcomingCheckins } from '@/data/calendar'
import { getCoachEmailSettingsPublic } from '@/lib/email/coach-settings'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NotificationsList } from '@/components/coach/dashboard/NotificationsList'
import { AttentionClientList } from '@/components/coach/dashboard/AttentionClientList'
import { CheckinRow } from '@/components/coach/dashboard/CheckinRow'
import { ActivityFeed } from '@/components/coach/dashboard/ActivityFeed'
import { WeekAgenda } from '@/components/coach/dashboard/WeekAgenda'
import { DashboardFreshness } from '@/components/coach/dashboard/DashboardFreshness'
import { cn } from '@/lib/utils'

function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Buenos días'
    if (hour < 20) return 'Buenas tardes'
    return 'Buenas noches'
}

function PulseTile({
    label,
    value,
    helper,
    icon,
    tone = 'default',
    href,
}: {
    label: string
    value: number
    helper: string
    icon: React.ReactNode
    tone?: 'default' | 'warning' | 'danger' | 'success'
    href: string
}) {
    return (
        <Link
            href={href}
            className={cn(
                'group flex flex-col rounded-xl border bg-background/70 p-3.5 backdrop-blur-sm transition-all hover:shadow-md sm:p-4',
                tone === 'danger' && value > 0 && 'border-destructive/30',
                tone === 'warning' && value > 0 && 'border-amber-500/30',
                (tone === 'default' || value === 0) && 'hover:border-primary/30',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg',
                    tone === 'danger' && value > 0 ? 'bg-destructive/10 text-destructive'
                        : tone === 'warning' && value > 0 ? 'bg-amber-500/10 text-amber-600'
                        : tone === 'success' ? 'bg-success/10 text-success'
                        : 'bg-primary/10 text-primary'
                )}>
                    {icon}
                </span>
            </div>
            <p className="mt-2 text-2xl font-bold leading-none tabular-nums sm:text-3xl">{value}</p>
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{helper}</p>
        </Link>
    )
}

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const [dashboard, emailSettings, upcomingEvents] = await Promise.all([
        getCoachDashboardData(coachId, user.id),
        getCoachEmailSettingsPublic(coachId).catch(() => null),
        getUpcomingCheckins(coachId, 7),
    ])

    const todayFormatted = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
    const showEmailSetupBanner = !emailSettings?.configured
    const upcoming7d = upcomingEvents.length
    const allClear =
        dashboard.kpis.pendingToday === 0 &&
        dashboard.kpis.requiresAttention === 0

    return (
        <div className="min-h-screen pb-20 lg:pb-8">
            <DashboardFreshness />

            <div className="space-y-6 px-4 pt-5 lg:px-8">
                {showEmailSetupBanner && (
                    <Card className="flex flex-col gap-3 border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                <Bell className="h-4 w-4 text-primary" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-sm font-semibold">Configura tu email de envío</p>
                                <p className="max-w-xl text-xs text-muted-foreground">
                                    Las revisiones e invitaciones se envían desde la cuenta general de la app.
                                    Conecta tu propia cuenta para que salgan con tu nombre y dirección.
                                </p>
                            </div>
                        </div>
                        <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
                            <Link href="/coach/settings?tab=email">
                                Configurar ahora
                                <ArrowRight className="ml-1.5 h-4 w-4" />
                            </Link>
                        </Button>
                    </Card>
                )}

                {/* Hero: saludo + pulso del negocio en un solo bloque */}
                <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.09] via-primary/[0.03] to-transparent">
                    <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm capitalize text-muted-foreground">{todayFormatted}</p>
                                <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
                                    {getGreeting()}, {dashboard.coachName}
                                </h1>
                                <p className="mt-1.5 text-sm text-muted-foreground">
                                    {allClear
                                        ? 'Todo al día. Sin urgencias ni casos abiertos ahora mismo.'
                                        : `Tienes ${dashboard.kpis.pendingToday} elemento${dashboard.kpis.pendingToday !== 1 ? 's' : ''} en la bandeja y ${dashboard.kpis.requiresAttention} atleta${dashboard.kpis.requiresAttention !== 1 ? 's' : ''} que revisar.`}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button variant="outline" size="sm" asChild>
                                    <Link href="/coach/calendar">
                                        <CalendarDays className="mr-1.5 h-4 w-4" />
                                        Calendario
                                    </Link>
                                </Button>
                                <Button size="sm" asChild>
                                    <Link href="/coach/members">
                                        <Users className="mr-1.5 h-4 w-4" />
                                        Atletas
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <PulseTile
                                label="Bandeja de hoy"
                                value={dashboard.kpis.pendingToday}
                                helper={dashboard.kpis.pendingReviews > 0
                                    ? `${dashboard.kpis.pendingReviews} revisión${dashboard.kpis.pendingReviews !== 1 ? 'es' : ''} sin cerrar`
                                    : 'Mensajes, revisiones y tareas'}
                                icon={<Inbox className="h-4 w-4" />}
                                tone="warning"
                                href="#bandeja"
                            />
                            <PulseTile
                                label="Necesitan atención"
                                value={dashboard.kpis.requiresAttention}
                                helper={dashboard.kpis.highPriorityAttention > 0
                                    ? `${dashboard.kpis.highPriorityAttention} caso${dashboard.kpis.highPriorityAttention !== 1 ? 's' : ''} de prioridad alta`
                                    : 'Sin incidencias críticas'}
                                icon={<AlertTriangle className="h-4 w-4" />}
                                tone="danger"
                                href="#atencion"
                            />
                            <PulseTile
                                label="Próximos 7 días"
                                value={upcoming7d}
                                helper="Revisiones programadas en agenda"
                                icon={<Clock className="h-4 w-4" />}
                                tone="default"
                                href="#agenda"
                            />
                            <PulseTile
                                label="Atletas activos"
                                value={dashboard.kpis.activeClients}
                                helper={dashboard.kpis.clientsWithoutProgram > 0
                                    ? `${dashboard.kpis.clientsWithoutProgram} sin programa activo`
                                    : 'Todos con seguimiento'}
                                icon={<CheckCircle2 className="h-4 w-4" />}
                                tone="success"
                                href="/coach/members"
                            />
                        </div>
                    </div>
                </Card>

                {/* Cuerpo: trabajo a la izquierda, contexto a la derecha */}
                <div className="grid items-start gap-6 xl:grid-cols-[1.55fr_1fr]">
                    <div className="min-w-0 space-y-6">
                        <Card id="bandeja" className="scroll-mt-24 overflow-hidden">
                            <div className="flex items-center justify-between border-b p-4">
                                <div className="flex items-center gap-2">
                                    <Inbox className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Bandeja de hoy</h2>
                                    {dashboard.notifications.length > 0 && (
                                        <Badge variant="secondary" className="border-0 bg-primary/10 text-primary">
                                            {dashboard.notifications.length}
                                        </Badge>
                                    )}
                                </div>
                                <p className="hidden text-xs text-muted-foreground sm:block">
                                    Mensajes · revisiones recibidas · tareas
                                </p>
                            </div>
                            <NotificationsList notifications={dashboard.notifications} coachId={coachId} />
                        </Card>

                        <Card id="atencion" className="scroll-mt-24 overflow-hidden">
                            <div className="flex items-center justify-between border-b p-4">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    <h2 className="font-semibold">Atletas que necesitan atención</h2>
                                    {dashboard.attentionClients.length > 0 && (
                                        <Badge variant="destructive">{dashboard.attentionClients.length}</Badge>
                                    )}
                                </div>
                                <p className="hidden text-xs text-muted-foreground sm:block">
                                    Atraso · adherencia baja · sin programa
                                </p>
                            </div>
                            <AttentionClientList clients={dashboard.attentionClients} />
                        </Card>

                        <Card id="ultimas-revisiones" className="scroll-mt-24 overflow-hidden">
                            <div className="flex items-center justify-between border-b p-4">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Últimas revisiones recibidas</h2>
                                    {dashboard.kpis.checkinsThisWeek > 0 && (
                                        <Badge variant="secondary" className="border-0 bg-muted/70">
                                            {dashboard.kpis.checkinsThisWeek} esta semana
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            {dashboard.recentCheckins.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                        <FileText className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <p className="font-medium">Aún no hay revisiones recibidas</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Cuando tus atletas respondan formularios aparecerán aquí con su estado.
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
                    </div>

                    <div className="min-w-0 space-y-6">
                        <Card id="agenda" className="scroll-mt-24 overflow-hidden">
                            <div className="flex items-center justify-between border-b p-4">
                                <div className="flex items-center gap-2">
                                    <CalendarDays className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Agenda · 7 días</h2>
                                </div>
                                {upcoming7d > 0 && (
                                    <Badge variant="secondary" className="border-0 bg-muted/70">
                                        {upcoming7d}
                                    </Badge>
                                )}
                            </div>
                            <WeekAgenda events={upcomingEvents} />
                        </Card>

                        <Card className="overflow-hidden">
                            <div className="flex items-center justify-between border-b p-4">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-primary" />
                                    <h2 className="font-semibold">Actividad reciente</h2>
                                </div>
                            </div>
                            <ActivityFeed items={dashboard.activity} />
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}
