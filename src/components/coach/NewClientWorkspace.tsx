'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client } from '@/types/coach'
import { AthleteAIProfile } from '@/types/athlete-profile'
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
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    Bot,
} from 'lucide-react'
import { WorkspaceHeader } from './workspace/WorkspaceHeader'
import { ClientSelector } from './workspace/ClientSelector'
import { AthleteProfileTab } from './workspace/AthleteProfileTab'
import { AthleteConfigSection } from './workspace/AthleteConfigSection'
import { ResumenTab } from './workspace/ResumenTab'
import { CheckinsTab } from './workspace/CheckinsTab'
import { ProgresoTab } from './workspace/ProgresoTab'
import { EventsTab } from './workspace/EventsTab'
import { CoachDebugPanel } from '@/components/debug/CoachDebugPanel'
import { PlanTab } from './workspace/PlanTab'
import { OnboardingTab } from './workspace/OnboardingTab'
import { NextIAChatPanel } from './workspace/NextIAChatPanel'

const WORKSPACE_TABS = [
    { value: 'athlete-profile', label: 'Perfil del atleta', icon: UserRound, gated: false },
    { value: 'onboarding', label: 'Onboarding', icon: ClipboardList, gated: false },
    { value: 'resumen', label: 'Resumen', icon: LayoutDashboard, gated: false },
    { value: 'nextia', label: 'Chat NextIA', icon: Bot, gated: false },
    { value: 'progreso', label: 'Progreso', icon: TrendingUp, gated: true },
    { value: 'plan', label: 'Plan', icon: CalendarDays, gated: true },
    { value: 'checkins', label: 'Revisiones', icon: FileText, gated: true },
    { value: 'events', label: 'Eventos', icon: Flag, gated: true },
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
}: NewClientWorkspaceProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [activeTab, setActiveTab] = useState(normalizeWorkspaceTab(searchParams.get('tab')))

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

    const handleClientChange = useCallback((clientId: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('client', clientId)
        params.set('tab', activeTab)
        router.push(`/coach/clients?${params.toString()}`)
    }, [activeTab, router, searchParams])

    const isPendingSignup = selectedClient ? !selectedClient.auth_user_id : false

    // Mejora 10: Prev/next navigation
    const activeClients = useMemo(() =>
        clients.filter(c => c.status === 'active'),
        [clients]
    )
    const currentIndex = activeClients.findIndex(c => c.id === selectedClientId)
    const canGoPrev = currentIndex > 0
    const canGoNext = currentIndex < activeClients.length - 1

    const handlePrevClient = useCallback(() => {
        if (canGoPrev) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('client', activeClients[currentIndex - 1].id)
            params.set('tab', activeTab)
            router.push(`/coach/clients?${params.toString()}`)
        }
    }, [canGoPrev, activeClients, currentIndex, activeTab, router, searchParams])

    const handleNextClient = useCallback(() => {
        if (canGoNext) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('client', activeClients[currentIndex + 1].id)
            params.set('tab', activeTab)
            router.push(`/coach/clients?${params.toString()}`)
        }
    }, [canGoNext, activeClients, currentIndex, activeTab, router, searchParams])

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
                Este cliente aún no se ha registrado. Las funciones de planificación se desbloquearán cuando cree su cuenta a través del enlace de invitación.
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

    return (
        <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
            {/* Client Selector + Prev/Next Navigation */}
            <div className="flex min-w-0 max-w-full items-center gap-1.5 sm:gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevClient}
                    disabled={!canGoPrev}
                    title="Cliente anterior (Alt+←)"
                    className="h-10 w-10 shrink-0 sm:h-8 sm:w-8"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="min-w-0 flex-1 sm:flex-initial">
                    <ClientSelector
                        clients={clients}
                        selectedClientId={selectedClientId}
                        onClientChange={handleClientChange}
                    />
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextClient}
                    disabled={!canGoNext}
                    title="Siguiente cliente (Alt+→)"
                    className="h-10 w-10 shrink-0 sm:h-8 sm:w-8"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>

                {currentIndex >= 0 && (
                    <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">
                        {currentIndex + 1}/{activeClients.length}
                    </span>
                )}
            </div>

            {/* Debug Panel (dev only) */}
            {process.env.NODE_ENV !== 'production' && (
                <CoachDebugPanel coachId={coachId} clientId={selectedClientId} />
            )}

            {/* Main Content */}
            {selectedClient ? (
                <>
                    <WorkspaceHeader
                        client={selectedClient}
                        clientStatus={clientStatus}
                        coachId={coachId}
                        formTemplates={formTemplates}
                        reviewTemplates={reviewTemplates}
                        onClientUpdated={handleRefresh}
                    />

                    {/* NEW TAB STRUCTURE */}
                    <Tabs value={activeTab} onValueChange={handleSwitchTab} className="min-w-0 max-w-full overflow-hidden">
                        <div className="mb-4 lg:hidden">
                            <Select value={activeTab} onValueChange={handleSwitchTab}>
                                <SelectTrigger className="h-12 w-full rounded-xl" aria-label="Sección de Workspace">
                                    <SelectValue placeholder="Selecciona una sección" />
                                </SelectTrigger>
                                <SelectContent>
                                    {WORKSPACE_TABS.map(tab => {
                                        const Icon = tab.icon
                                        const disabled = tab.gated && isPendingSignup
                                        return (
                                            <SelectItem key={tab.value} value={tab.value} disabled={disabled}>
                                                <span className="flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    <span>{tab.label}</span>
                                                    {disabled && <Lock className="ml-1 h-3 w-3" />}
                                                </span>
                                            </SelectItem>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="hidden lg:block">
                            <TabsList className="workspace-tabs-list max-w-full gap-3">
                                {WORKSPACE_TABS.map(tab => {
                                    const Icon = tab.icon
                                    const disabled = tab.gated && isPendingSignup
                                    return (
                                        <TabsTrigger
                                            key={tab.value}
                                            value={tab.value}
                                            disabled={disabled}
                                            className="workspace-tab-trigger min-w-[8.75rem] shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span>{tab.label}</span>
                                            {disabled && <Lock className="ml-1 h-3 w-3" />}
                                        </TabsTrigger>
                                    )
                                })}
                            </TabsList>
                        </div>

                        <div className="min-w-0 max-w-full overflow-x-hidden lg:min-h-[500px]">
                            <TabsContent value="athlete-profile" className="mt-0 min-w-0 space-y-6">
                                <AthleteConfigSection
                                    key={`config-${selectedClient.id}`}
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
                                    activeProgram={activeProgram}
                                    events={events}
                                    metrics={metrics}
                                    onRefresh={handleRefresh}
                                    onSwitchTab={handleSwitchTab}
                                    metricDefinitions={metricDefinitions}
                                    previousCheckin={previousCheckin}
                                />
                            </TabsContent>

                            <TabsContent value="nextia" className="mt-0 min-w-0">
                                <NextIAChatPanel
                                    coachId={coachId}
                                    clientId={selectedClient.id}
                                    clientName={selectedClient.full_name || selectedClient.email}
                                    standalone
                                />
                            </TabsContent>

                            <TabsContent value="plan" className="mt-0 min-w-0">
                                {isPendingSignup ? (
                                    <BlockedTabContent />
                                ) : (
                                    <PlanTab
                                        coachId={coachId}
                                        clientId={selectedClient.id}
                                        activeProgram={activeProgram}
                                        programs={programs}
                                        onRefresh={handleRefresh}
                                    />
                                )}
                            </TabsContent>

                            <TabsContent value="events" className="mt-0 min-w-0">
                                {isPendingSignup ? (
                                    <BlockedTabContent />
                                ) : (
                                    <EventsTab
                                        coachId={coachId}
                                        clientId={selectedClient.id}
                                        events={events}
                                        onRefresh={handleRefresh}
                                    />
                                )}
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
                </>
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
        tab === 'nextia' ||
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
