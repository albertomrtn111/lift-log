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
} from '@/data/workspace'
import { MetricDefinition } from '@/types/metrics'
import { FormTemplate } from '@/types/forms'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    LayoutDashboard,
    FileText,
    TrendingUp,
    CalendarDays,
    Lock,
    ClipboardList,
    ChevronLeft,
    ChevronRight,
    UserRound,
} from 'lucide-react'
import { WorkspaceHeader } from './workspace/WorkspaceHeader'
import { ClientSelector } from './workspace/ClientSelector'
import { AthleteProfileTab } from './workspace/AthleteProfileTab'
import { ResumenTab } from './workspace/ResumenTab'
import { CheckinsTab } from './workspace/CheckinsTab'
import { ProgresoTab } from './workspace/ProgresoTab'
import { CoachDebugPanel } from '@/components/debug/CoachDebugPanel'
import { PlanTab } from './workspace/PlanTab'
import { OnboardingTab } from './workspace/OnboardingTab'

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
    coachId: string
    metrics: Awaited<ReturnType<typeof import('@/data/workspace').getClientMetrics>>
    metricDefinitions: MetricDefinition[]
    formTemplates: FormTemplate[]
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
    coachId,
    metrics,
    metricDefinitions,
    formTemplates,
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
                router.replace(`/coach/clients?client=${stored}&tab=${activeTab}`)
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

    const handleSwitchTab = useCallback((tab: string) => {
        setActiveTab(tab)

        if (selectedClientId) {
            router.replace(`/coach/clients?client=${selectedClientId}&tab=${tab}`)
        } else {
            router.replace(`/coach/clients?tab=${tab}`)
        }
    }, [router, selectedClientId])

    const handleClientChange = (clientId: string) => {
        router.push(`/coach/clients?client=${clientId}&tab=${activeTab}`)
    }

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
            router.push(`/coach/clients?client=${activeClients[currentIndex - 1].id}&tab=${activeTab}`)
        }
    }, [canGoPrev, activeClients, currentIndex, activeTab, router])

    const handleNextClient = useCallback(() => {
        if (canGoNext) {
            router.push(`/coach/clients?client=${activeClients[currentIndex + 1].id}&tab=${activeTab}`)
        }
    }, [canGoNext, activeClients, currentIndex, activeTab, router])

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
        <Card className="p-12 text-center">
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
        <div className="space-y-4">
            {/* Client Selector + Prev/Next Navigation */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevClient}
                    disabled={!canGoPrev}
                    title="Cliente anterior (Alt+←)"
                    className="h-8 w-8 shrink-0"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <ClientSelector
                    clients={clients}
                    selectedClientId={selectedClientId}
                />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextClient}
                    disabled={!canGoNext}
                    title="Siguiente cliente (Alt+→)"
                    className="h-8 w-8 shrink-0"
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
                        onClientUpdated={handleRefresh}
                    />

                    {/* NEW TAB STRUCTURE */}
                    <Tabs value={activeTab} onValueChange={handleSwitchTab} className="w-full">
                    <TabsList className="workspace-tabs-list gap-2.5 sm:gap-3">
                        <TabsTrigger
                            value="athlete-profile"
                            className="workspace-tab-trigger shrink-0 sm:min-w-[10.5rem]"
                        >
                                <UserRound className="h-4 w-4" />
                                <span className="hidden sm:inline">Perfil del atleta</span>
                            </TabsTrigger>
                        <TabsTrigger
                            value="onboarding"
                            className="workspace-tab-trigger shrink-0 sm:min-w-[9rem]"
                        >
                                <ClipboardList className="h-4 w-4" />
                                <span className="hidden sm:inline">Onboarding</span>
                            </TabsTrigger>
                        <TabsTrigger
                            value="resumen"
                            className="workspace-tab-trigger shrink-0 sm:min-w-[8.75rem]"
                        >
                                <LayoutDashboard className="h-4 w-4" />
                                <span className="hidden sm:inline">Resumen</span>
                            </TabsTrigger>
                        <TabsTrigger
                            value="plan"
                            disabled={isPendingSignup}
                            className="workspace-tab-trigger shrink-0 sm:min-w-[8.75rem] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                                <CalendarDays className="h-4 w-4" />
                                <span className="hidden sm:inline">Plan</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                            </TabsTrigger>
                        <TabsTrigger
                            value="checkins"
                            disabled={isPendingSignup}
                            className="workspace-tab-trigger shrink-0 sm:min-w-[9rem] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                                <FileText className="h-4 w-4" />
                                <span className="hidden sm:inline">Revisiones</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                            </TabsTrigger>
                        <TabsTrigger
                            value="progreso"
                            disabled={isPendingSignup}
                            className="workspace-tab-trigger shrink-0 sm:min-w-[9rem] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                                <TrendingUp className="h-4 w-4" />
                                <span className="hidden sm:inline">Progreso</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-4 min-h-[500px]">
                            <TabsContent value="athlete-profile">
                                <AthleteProfileTab
                                    key={`${selectedClient.id}:${athleteProfile?.updated_at ?? 'new'}`}
                                    clientId={selectedClient.id}
                                    clientName={selectedClient.full_name || 'Atleta'}
                                    athleteProfile={athleteProfile}
                                />
                            </TabsContent>

                            <TabsContent value="onboarding">
                                <OnboardingTab
                                    clientId={selectedClient.id}
                                    coachId={coachId}
                                    metricDefinitions={metricDefinitions}
                                />
                            </TabsContent>

                            <TabsContent value="resumen">
                                <ResumenTab
                                    coachId={coachId}
                                    clientId={selectedClient.id}
                                    client={selectedClient}
                                    clientStatus={clientStatus}
                                    latestCheckin={latestCheckin}
                                    activeMacroPlan={activeMacroPlan}
                                    activeProgram={activeProgram}
                                    metrics={metrics}
                                    onRefresh={handleRefresh}
                                    onSwitchTab={handleSwitchTab}
                                    metricDefinitions={metricDefinitions}
                                    previousCheckin={previousCheckin}
                                />
                            </TabsContent>

                            <TabsContent value="plan">
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

                            <TabsContent value="checkins">
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

                            <TabsContent value="progreso">
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
                <Card className="p-8 text-center">
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
        tab === 'checkins' ||
        tab === 'progreso'
    ) {
        return tab
    }

    return 'resumen'
}
