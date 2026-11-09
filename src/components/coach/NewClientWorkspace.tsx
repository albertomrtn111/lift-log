'use client'

import { useState, useCallback, useMemo, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client } from '@/types/coach'
import { AthleteAIProfile } from '@/types/athlete-profile'
import type { AthleteCurrentGoal } from '@/types/athlete-current-goal'
import {
    ClientStatus,
    CheckinWithReview,
    MacroPlan,
    TrainingProgram,
    DietPlan,
    ClientSelectorOption,
    ClientEvent,
} from '@/data/workspace'
import { MetricDefinition } from '@/types/metrics'
import { FormTemplate } from '@/types/forms'
import type { ReviewTemplate } from '@/data/review-templates'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SampleAthleteBanner } from '@/components/coach/onboarding/SampleAthleteBanner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    LayoutDashboard,
    FileText,
    TrendingUp,
    CalendarDays,
    Flag,
    Lock,
    ClipboardList,
    ChevronLeft,
    ChevronRight,
    UserRound,
    Loader2,
} from 'lucide-react'
import { WorkspaceHeader } from './workspace/WorkspaceHeader'
import { ClientSelector } from './workspace/ClientSelector'
import { AthleteProfileTab } from './workspace/AthleteProfileTab'
import { AthleteConfigSection } from './workspace/AthleteConfigSection'
import { AthleteDailyMetricsCard } from './workspace/AthleteDailyMetricsCard'
import { AthleteCurrentGoalCard } from './workspace/AthleteCurrentGoalCard'
import { ResumenTab } from './workspace/ResumenTab'
import { CheckinsTab } from './workspace/CheckinsTab'
import { ProgresoTab } from './workspace/ProgresoTab'
import { EventsTab } from './workspace/EventsTab'
import { CoachDebugPanel } from '@/components/debug/CoachDebugPanel'
import { PlanTab } from './workspace/PlanTab'
import { OnboardingTab } from './workspace/OnboardingTab'

const WORKSPACE_TABS = [
    { value: 'athlete-profile', label: 'Perfil del atleta', icon: UserRound, gated: false },
    { value: 'onboarding', label: 'Onboarding', icon: ClipboardList, gated: false },
    { value: 'resumen', label: 'Resumen', icon: LayoutDashboard, gated: false },
    { value: 'progreso', label: 'Progreso', icon: TrendingUp, gated: true },
    { value: 'plan', label: 'Plan', icon: CalendarDays, gated: false },
    { value: 'checkins', label: 'Revisiones', icon: FileText, gated: true },
    { value: 'events', label: 'Eventos', icon: Flag, gated: false },
] as const

interface NewClientWorkspaceProps {
    clients: ClientSelectorOption[]
    selectedClient: Client | null
    clientStatus: ClientStatus | null
    latestCheckin: CheckinWithReview | null
    checkins: CheckinWithReview[]
    activeMacroPlan: MacroPlan | null
    macroPlans: MacroPlan[]
    activeDietPlan: DietPlan | null
    dietPlans: DietPlan[]
    activeProgram: TrainingProgram | null
    programs: TrainingProgram[]
    events: ClientEvent[]
    coachId: string
    metrics: Awaited<ReturnType<typeof import('@/data/workspace').getClientMetrics>>
    metricDefinitions: MetricDefinition[]
    formTemplates: FormTemplate[]
    reviewTemplates?: ReviewTemplate[]
    athleteProfile: AthleteAIProfile | null
    currentGoal: AthleteCurrentGoal | null
}

export function NewClientWorkspace({
    clients,
    selectedClient,
    clientStatus,
    latestCheckin,
    checkins,
    activeMacroPlan,
    macroPlans,
    activeDietPlan,
    dietPlans,
    activeProgram,
    programs,
    events,
    coachId,
    metrics,
    metricDefinitions,
    formTemplates,
    reviewTemplates,
    athleteProfile,
    currentGoal,
}: NewClientWorkspaceProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [activeTab, setActiveTab] = useState(normalizeWorkspaceTab(searchParams.get('tab')))
    // Cambiar de cliente recarga todo el workspace en servidor: mostramos estado de carga
    const [isSwitchingClient, startClientTransition] = useTransition()

    // Persist selected client in localStorage so navigating away and back preserves selection
    const STORAGE_KEY = 'coach_last_client_id'

    const selectedClientId = selectedClient?.id || searchParams.get('client')

    // On mount: if no ?client= param, redirect to the last stored client
    useEffect(() => {
        if (!searchParams.get('client')) {
            const stored = localStorage.getItem(STORAGE_KEY)
            // Only redirect if the stored client is still in the list
            if (stored && clients.some(c => c.id === stored)) {
                const params = new URLSearchParams(searchParams.toString())
                params.set('client', stored)
                params.set('tab', activeTab)
                router.replace(`/coach/clients?${params.toString()}`)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Run once on mount

    // Save selected client to localStorage whenever it changes
    useEffect(() => {
        if (selectedClientId) {
            localStorage.setItem(STORAGE_KEY, selectedClientId)
        }
    }, [selectedClientId])

    useEffect(() => {
        const nextTab = normalizeWorkspaceTab(searchParams.get('tab'))
        setActiveTab(prev => (prev === nextTab ? prev : nextTab))
    }, [searchParams])

    useEffect(() => {
        const active = document.querySelector<HTMLElement>('[data-workspace-tab][data-state="active"]')
        active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, [activeTab])

    const handleRefresh = useCallback(() => {
        router.refresh()
    }, [router])

    const handleSwitchTab = useCallback((target: string) => {
        const [requestedTab, planSection] = target.split(':')
        const tab = normalizeWorkspaceTab(requestedTab)
        const params = new URLSearchParams(searchParams.toString())

        setActiveTab(tab)
        params.set('tab', tab)

        if (selectedClientId) params.set('client', selectedClientId)
        else params.delete('client')

        if (tab === 'plan' && planSection) params.set('plan', planSection)
        else if (tab !== 'plan') params.delete('plan')

        router.replace(`/coach/clients?${params.toString()}`)
    }, [router, searchParams, selectedClientId])

    const navigateToClient = useCallback((clientId: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('client', clientId)
        params.set('tab', activeTab)
        startClientTransition(() => {
            router.push(`/coach/clients?${params.toString()}`, { scroll: false })
        })
    }, [activeTab, router, searchParams])

    const handleClientChange = navigateToClient

    // La atleta de ejemplo no tiene cuenta, pero se puede explorar entera
    const isPendingSignup = selectedClient ? !selectedClient.auth_user_id && !selectedClient.is_sample : false

    // Mejora 10: Prev/next navigation
    const activeClients = useMemo(() =>
        clients.filter(c => c.status === 'active'),
        [clients]
    )
    const currentIndex = activeClients.findIndex(c => c.id === selectedClientId)
    const canGoPrev = currentIndex > 0
    const canGoNext = currentIndex < activeClients.length - 1

    const handlePrevClient = useCallback(() => {
        if (canGoPrev) navigateToClient(activeClients[currentIndex - 1].id)
    }, [canGoPrev, activeClients, currentIndex, navigateToClient])

    const handleNextClient = useCallback(() => {
        if (canGoNext) navigateToClient(activeClients[currentIndex + 1].id)
    }, [canGoNext, activeClients, currentIndex, navigateToClient])

    // Keyboard shortcuts: Alt+← / Alt+→
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); handlePrevClient() }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); handleNextClient() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handlePrevClient, handleNextClient])

    // Blocked tab content for pending signup clients
    const BlockedTabContent = () => (
        <Card className="p-6 text-center sm:p-12">
            <Lock className="h-12 w-12 text-amber-500/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Función bloqueada</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
                Este cliente aún no se ha registrado. Esta sección se activará cuando cree su cuenta con el enlace de invitación.
            </p>
        </Card>
    )

    // Obtener el checkin anterior al último completado (para deltas de métricas)
    const previousCheckin = useMemo(() => {
        const completed = [...checkins]
            .filter(c => c.status !== 'pending' && c.submitted_at)
            .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime())
        return completed[1] ?? null  // [0] es latestCheckin, [1] es el anterior
    }, [checkins])

    const positionLabel = currentIndex >= 0
        ? `Workspace · ${currentIndex + 1} de ${activeClients.length}`
        : 'Workspace'

    // Anterior / siguiente atleta activo (también con Alt+← y Alt+→)
    const navigation = (
        <div className="flex shrink-0 items-center gap-1">
            <Button
                variant="outline"
                size="icon"
                onClick={handlePrevClient}
                disabled={!canGoPrev || isSwitchingClient}
                title="Atleta anterior (Alt+←)"
                aria-label="Atleta anterior"
                className="h-9 w-9"
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                onClick={handleNextClient}
                disabled={!canGoNext || isSwitchingClient}
                title="Siguiente atleta (Alt+→)"
                aria-label="Siguiente atleta"
                className="h-9 w-9"
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    )

    // Secciones como píldoras: en el móvil se deslizan y se ven todas, sin desplegable.
    const tabsBar = (
        <div className="nt-scroll-x px-3 pb-3 sm:px-0 lg:pb-4">
            <TabsList className="nt-pills inline-flex h-auto w-max min-w-0 justify-start gap-1 rounded-full bg-foreground/[0.05] p-1 ring-1 ring-inset ring-foreground/[0.06]">
                {WORKSPACE_TABS.map(tab => {
                    const Icon = tab.icon
                    const disabled = tab.gated && isPendingSignup
                    return (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            disabled={disabled}
                            data-workspace-tab=""
                            className="h-9 gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                        >
                            <Icon className="h-4 w-4 max-xl:hidden" />
                            <span>{tab.label}</span>
                            {disabled && <Lock className="h-3 w-3" />}
                        </TabsTrigger>
                    )
                })}
            </TabsList>
        </div>
    )

    return (
        <div className="min-w-0 max-w-full space-y-4 overflow-x-clip">
            {/* Debug Panel (dev only) */}
            {process.env.NODE_ENV !== 'production' && (
                <CoachDebugPanel coachId={coachId} clientId={selectedClientId} />
            )}

            {/* Main Content */}
            {selectedClient ? (
                <div
                    className={cn('relative min-w-0 space-y-4 transition-opacity', isSwitchingClient && 'pointer-events-none opacity-50')}
                    aria-busy={isSwitchingClient}
                >
                    {isSwitchingClient && (
                        <div className="absolute inset-x-0 top-16 z-10 flex justify-center">
                            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-md">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Cargando cliente...
                            </div>
                        </div>
                    )}
                    {selectedClient.is_sample && (
                        <SampleAthleteBanner
                            coachId={coachId}
                            clientId={selectedClient.id}
                            clientName={selectedClient.full_name || 'Lucía'}
                        />
                    )}
                    {/* NEW TAB STRUCTURE */}
                    <Tabs value={activeTab} onValueChange={handleSwitchTab} className="min-w-0 max-w-full">
                    <WorkspaceHeader
                        client={selectedClient}
                        avatarUrl={clients.find(c => c.id === selectedClient.id)?.avatar_url}
                        clientStatus={clientStatus}
                        coachId={coachId}
                        formTemplates={formTemplates}
                        reviewTemplates={reviewTemplates}
                        onClientUpdated={handleRefresh}
                        eyebrow={positionLabel}
                        selector={(subline) => (
                            <ClientSelector
                                variant="identity"
                                clients={clients}
                                selectedClientId={selectedClientId}
                                onClientChange={handleClientChange}
                                isSwitching={isSwitchingClient}
                                eyebrow={positionLabel}
                                subline={subline}
                            />
                        )}
                        navigation={navigation}
                        tabs={tabsBar}
                    />
                        <div className="min-w-0 max-w-full overflow-x-clip pt-4 lg:min-h-[500px] lg:pt-6">
                            <TabsContent value="athlete-profile" className="mt-0 min-w-0 space-y-6">
                                <AthleteCurrentGoalCard
                                    key={`goal-${selectedClient.id}`}
                                    coachId={coachId}
                                    clientId={selectedClient.id}
                                    goal={currentGoal}
                                />
                                <AthleteConfigSection
                                    key={`config-${selectedClient.id}`}
                                    clientId={selectedClient.id}
                                />
                                <AthleteDailyMetricsCard
                                    key={`daily-${selectedClient.id}`}
                                    clientId={selectedClient.id}
                                />
                                <AthleteProfileTab
                                    key={selectedClient.id}
                                    clientId={selectedClient.id}
                                    clientName={selectedClient.full_name || 'Atleta'}
                                    athleteProfile={athleteProfile}
                                />
                            </TabsContent>

                            <TabsContent value="onboarding" className="mt-0 min-w-0">
                                <OnboardingTab
                                    clientId={selectedClient.id}
                                    coachId={coachId}
                                    metricDefinitions={metricDefinitions}
                                />
                            </TabsContent>

                            <TabsContent value="resumen" className="mt-0 min-w-0">
                                <ResumenTab
                                    coachId={coachId}
                                    clientId={selectedClient.id}
                                    client={selectedClient}
                                    clientStatus={clientStatus}
                                    latestCheckin={latestCheckin}
                                    activeMacroPlan={activeMacroPlan}
                                    macroPlans={macroPlans}
                                    dietPlans={dietPlans}
                                    activeProgram={activeProgram}
                                    currentGoal={currentGoal}
                                    events={events}
                                    metrics={metrics}
                                    onRefresh={handleRefresh}
                                    onSwitchTab={handleSwitchTab}
                                    metricDefinitions={metricDefinitions}
                                    previousCheckin={previousCheckin}
                                />
                            </TabsContent>

                            <TabsContent value="plan" className="mt-0 min-w-0">
                                <PlanTab
                                    coachId={coachId}
                                    clientId={selectedClient.id}
                                    activeProgram={activeProgram}
                                    programs={programs}
                                    onRefresh={handleRefresh}
                                />
                            </TabsContent>

                            <TabsContent value="events" className="mt-0 min-w-0">
                                <EventsTab
                                    coachId={coachId}
                                    clientId={selectedClient.id}
                                    events={events}
                                    onRefresh={handleRefresh}
                                />
                            </TabsContent>

                            <TabsContent value="checkins" className="mt-0 min-w-0">
                                {isPendingSignup ? (
                                    <BlockedTabContent />
                                ) : (
                                    <CheckinsTab
                                        coachId={coachId}
                                        clientId={selectedClient.id}
                                        checkins={checkins}
                                        onRefresh={handleRefresh}
                                        metricDefinitions={metricDefinitions}
                                        formTemplates={formTemplates}
                                        isSampleClient={Boolean(selectedClient.is_sample)}
                                    />
                                )}
                            </TabsContent>

                            <TabsContent value="progreso" className="mt-0 min-w-0">
                                {isPendingSignup ? (
                                    <BlockedTabContent />
                                ) : (
                                    <ProgresoTab clientId={selectedClient.id} coachId={coachId} />
                                )}
                            </TabsContent>

                        </div>
                    </Tabs>
                </div>
            ) : (
                <Card className="p-6 text-center sm:p-8">
                    <LayoutDashboard className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                    <h3 className="font-semibold text-lg">Selecciona un cliente</h3>
                    <p className="text-muted-foreground mt-2">
                        Usa el selector de arriba para elegir un cliente y ver su workspace
                    </p>
                </Card>
            )}
        </div>
    )
}

function normalizeWorkspaceTab(tab: string | null) {
    if (
        tab === 'athlete-profile' ||
        tab === 'onboarding' ||
        tab === 'resumen' ||
        tab === 'plan' ||
        tab === 'events' ||
        tab === 'checkins' ||
        tab === 'progreso'
    ) {
        return tab
    }

    // Galería y Medidas viven ahora dentro de Revisiones
    if (tab === 'galeria' || tab === 'medidas') return 'checkins'

    return 'resumen'
}
