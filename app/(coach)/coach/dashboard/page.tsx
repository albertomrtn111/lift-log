import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ArrowRight,
    Bell,
    CalendarDays,
    Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachDashboardData } from '@/data/dashboard'
import { getUpcomingCheckins } from '@/data/calendar'
import { getClientsForSelector } from '@/data/workspace'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import { AthleteWall, type WallAthlete } from '@/components/coach/dashboard/AthleteWall'
import { CountUp } from '@/components/coach/CountUp'
import { SectionHeading } from '@/components/coach/SectionHeading'
import { getCoachEmailSettingsPublic } from '@/lib/email/coach-settings'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NotificationsList } from '@/components/coach/dashboard/NotificationsList'
import { AttentionClientList } from '@/components/coach/dashboard/AttentionClientList'
import { RecentReviewsAndActivity } from '@/components/coach/dashboard/RecentReviewsAndActivity'
import { WeekAgenda } from '@/components/coach/dashboard/WeekAgenda'
import { DashboardFreshness } from '@/components/coach/dashboard/DashboardFreshness'
import { cn } from '@/lib/utils'
import { getCoachChecklist } from '@/lib/onboarding/checklist-data'
import { OnboardingChecklistCard } from '@/components/coach/onboarding/OnboardingChecklistCard'
import { getAthleteJourneys } from '@/lib/onboarding/athlete-journey-data'
import { AthleteJourneyCard } from '@/components/coach/onboarding/AthleteJourneyCard'
import { CoachNotificationsBell } from '@/components/coach/notifications/CoachNotificationsBell'

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

    const [dashboard, emailSettings, upcomingEvents, checklist, athleteJourneys, roster] = await Promise.all([
        getCoachDashboardData(coachId, user.id),
        getCoachEmailSettingsPublic(coachId).catch(() => null),
        getUpcomingCheckins(coachId, 7),
        getCoachChecklist(coachId).catch(() => null),
        getAthleteJourneys(coachId).catch(() => []),
        getClientsForSelector(coachId).catch(() => []),
    ])

    const todayFormatted = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
    const showEmailSetupBanner = !emailSettings?.configured
    const upcoming7d = upcomingEvents.length
    const { activeClients, requiresAttention, highPriorityAttention } = dashboard.kpis
    const inboxCount = dashboard.notifications.length
    const firstName = dashboard.coachName.split(' ')[0]

    // Muro: todos los activos, y encendidos los que hoy necesitan atención.
    const attentionById = new Map(dashboard.attentionClients.map(client => [client.id, client]))
    const wall: WallAthlete[] = roster
        .filter(client => client.status === 'active')
        .map(client => {
            const { displayName, initials } = getClientDisplayIdentity(client)
            const attention = attentionById.get(client.id)
            return {
                id: client.id,
                name: displayName,
                initials,
                avatarUrl: client.avatar_url ?? null,
                severity: attention?.primarySeverity,
                reason: attention?.primaryReason,
            }
        })
    const firstAttention = dashboard.attentionClients[0]

    const mediumPriority = Math.max(0, requiresAttention - highPriorityAttention)

    // Las cifras del día, dentro del panel: cada una lleva a su bloque.
    const pulse = [
        {
            label: 'Bandeja de hoy',
            value: inboxCount,
            helper: inboxCount > 0 ? 'Mensajes, revisiones y tareas' : 'Nada nuevo por leer',
            href: '#bandeja',
            dot: null,
        },
        {
            label: 'Prioridad alta',
            value: highPriorityAttention,
            helper: highPriorityAttention > 0 ? 'Atiéndelos hoy' : 'Ningún caso urgente',
            href: '#atencion',
            dot: '#F87171',
        },
        {
            label: 'Prioridad media',
            value: mediumPriority,
            helper: mediumPriority > 0 ? 'Esta semana' : 'Sin casos abiertos',
            href: '#atencion',
            dot: '#FBBF24',
        },
        {
            label: 'Próximos 7 días',
            value: upcoming7d,
            helper: upcoming7d === 1 ? 'Revisión en agenda' : 'Revisiones en agenda',
            href: '#agenda',
            dot: null,
        },
    ]

    return (
        <div className="min-h-screen pb-28 lg:pb-10">
            <DashboardFreshness coachId={coachId} />

            <div className="mx-auto max-w-[1360px] space-y-5 px-3 pt-3 sm:px-4 lg:space-y-6 lg:px-8 lg:pt-8">
                {checklist?.visible && <OnboardingChecklistCard coachId={coachId} checklist={checklist} />}

                {athleteJourneys.length > 0 && <AthleteJourneyCard coachId={coachId} rows={athleteJourneys} />}

                {showEmailSetupBanner && !checklist?.visible && (
                    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <Bell className="h-4 w-4 text-primary" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-sm font-semibold">Configura tu email de envío</p>
                                <p className="max-w-xl text-[13px] text-muted-foreground">
                                    Las revisiones e invitaciones se envían desde la cuenta general de la app.
                                    Conecta tu propia cuenta para que salgan con tu nombre y dirección.
                                </p>
                            </div>
                        </div>
                        <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
                            <Link href="/coach/settings?tab=email">
                                Configurar ahora
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </Card>
                )}

                {/* Panel del día: las cifras que importan y el muro con los atletas de verdad */}
                <section className="nt-stage nt-rise rounded-[28px] px-5 pb-6 pt-5 sm:px-8 sm:pb-7 sm:pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                        <p className="nt-eyebrow min-w-0 text-white/50">
                            {todayFormatted}<span className="hidden sm:inline"> · {getGreeting()}, {firstName}</span>
                        </p>
                        <div className="hidden items-center gap-2 lg:flex">
                                {firstAttention ? (
                                    <Link
                                        href={`/coach/clients?client=${firstAttention.id}`}
                                        className="group inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#0B0D12] transition-transform duration-300 hover:-translate-y-px active:scale-[0.98]"
                                    >
                                        Empezar por {getClientDisplayIdentity(firstAttention).displayName.split(' ')[0]}
                                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                                    </Link>
                                ) : (
                                    <Link
                                        href="/coach/members"
                                        className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#0B0D12] transition-transform duration-300 hover:-translate-y-px"
                                    >
                                        <Users className="h-4 w-4" />
                                        Ver atletas
                                    </Link>
                                )}
                                <Link
                                    href="/coach/calendar"
                                    className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-[13.5px] font-medium text-white transition-colors hover:border-white/50"
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    Calendario
                                </Link>
                        </div>
                        <CoachNotificationsBell className="border-white/15 bg-white/[0.06] text-white hover:bg-white/10 lg:hidden" />
                    </div>

                    <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch lg:gap-12">
                        <div className="grid min-w-0 grid-cols-2 content-center gap-x-6 gap-y-6 sm:gap-x-10">
                            {pulse.map(item => (
                                <Link key={item.label} href={item.href} className="group min-w-0">
                                    <span className="nt-eyebrow flex items-center gap-2 text-[10.5px] text-white/50 transition-colors group-hover:text-white/80">
                                        {item.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.dot }} />}
                                        <span className="truncate">{item.label}</span>
                                    </span>
                                    <span
                                        className="nt-number mt-1.5 block text-[2.25rem] leading-none text-white sm:text-[2.5rem]"
                                        style={item.dot && item.value > 0 ? { color: item.dot } : undefined}
                                    >
                                        <CountUp value={item.value} id={`dashboard:${item.label}`} />
                                    </span>
                                    <span className="mt-1.5 flex items-center gap-1 text-[13px] text-white/55">
                                        <span className="truncate">{item.helper}</span>
                                        <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                                    </span>
                                </Link>
                            ))}
                        </div>

                        {wall.length > 0 && (
                            <div className="min-w-0 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
                                <Link href="/coach/members" className="group mb-4 flex items-baseline justify-between gap-3">
                                    <span className="nt-eyebrow text-[10.5px] text-white/50 group-hover:text-white/80">Atletas activos</span>
                                    <span className="text-[13px] text-white/55">
                                        <span className="nt-number text-[1.35rem] text-white"><CountUp value={activeClients} id="dashboard:activos" /></span>
                                        {dashboard.kpis.clientsWithoutProgram > 0 ? ` · ${dashboard.kpis.clientsWithoutProgram} sin programa` : ' · todos con seguimiento'}
                                    </span>
                                </Link>
                                <AthleteWall athletes={wall} />
                                <p className="nt-eyebrow mt-4 flex items-center justify-center gap-4 text-[10px] text-white/40">
                                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F87171]" /> Alta</span>
                                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FBBF24]" /> Media</span>
                                    <span className="hidden sm:inline">Pasa el ratón para ver por qué</span>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* En móvil y tableta, los botones van al final del panel */}
                    <div className="nt-stage-ctas mt-6 flex flex-nowrap items-center gap-2 lg:hidden">
                                {firstAttention ? (
                                    <Link
                                        href={`/coach/clients?client=${firstAttention.id}`}
                                        className="group inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#0B0D12] transition-transform duration-300 hover:-translate-y-px active:scale-[0.98]"
                                    >
                                        Empezar por {getClientDisplayIdentity(firstAttention).displayName.split(' ')[0]}
                                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                                    </Link>
                                ) : (
                                    <Link
                                        href="/coach/members"
                                        className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#0B0D12] transition-transform duration-300 hover:-translate-y-px"
                                    >
                                        <Users className="h-4 w-4" />
                                        Ver atletas
                                    </Link>
                                )}
                                <Link
                                    href="/coach/calendar"
                                    className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-[13.5px] font-medium text-white transition-colors hover:border-white/50"
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    Calendario
                                </Link>
                    </div>
                </section>

                {/* Cuerpo: trabajo a la izquierda, contexto a la derecha.
                    Fila 1: atención + bandeja a la misma altura que la agenda */}
                <div className="grid gap-5 lg:gap-6 xl:grid-cols-[1.55fr_1fr]">
                    <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
                        {/* En xl la lista no estira la fila: rellena el hueco hasta el final de la agenda y hace scroll */}
                        <Card id="atencion" className="relative scroll-mt-24 overflow-hidden xl:min-h-[18rem] xl:flex-1">
                            <div className="flex flex-col xl:absolute xl:inset-0">
                                <SectionHeading
                                    title="Necesitan atención"
                                    count={dashboard.attentionClients.length}
                                    countTone="danger"
                                    helper="Atraso · adherencia baja · sin programa"
                                />
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    <AttentionClientList clients={dashboard.attentionClients} />
                                </div>
                            </div>
                        </Card>

                        <Card id="bandeja" className="scroll-mt-24 overflow-hidden">
                            <SectionHeading
                                title="Bandeja de hoy"
                                count={dashboard.notifications.length}
                                helper="Mensajes · revisiones recibidas · tareas"
                            />
                            <NotificationsList notifications={dashboard.notifications} coachId={coachId} />
                        </Card>
                    </div>

                    <Card id="agenda" className="flex scroll-mt-24 flex-col overflow-hidden">
                        <SectionHeading title="Agenda" count={upcoming7d} helper="Próximos 7 días" />
                        <WeekAgenda events={upcomingEvents} />
                    </Card>
                </div>

                {/* Fila 2: historial a la izquierda, actividad a la derecha */}
                <RecentReviewsAndActivity
                    recentCheckins={dashboard.recentCheckins}
                    activity={dashboard.activity}
                    checkinsThisWeek={dashboard.kpis.checkinsThisWeek}
                />
            </div>
        </div>
    )
}

