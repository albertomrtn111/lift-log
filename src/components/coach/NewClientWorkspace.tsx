'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client } from '@/types/coach'
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
import { Badge } from '@/components/ui/badge'
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
    MessageSquare,
} from 'lucide-react'
import { WorkspaceHeader } from './workspace/WorkspaceHeader'
import { ClientSelector } from './workspace/ClientSelector'
import { ResumenTab } from './workspace/ResumenTab'
import { CheckinsTab } from './workspace/CheckinsTab'
import { PlanningTab } from './workspace/PlanningTab'
import { DietTab } from './tabs/DietTab'
import { ProgresoTab } from './workspace/ProgresoTab'
import { CoachDebugPanel } from '@/components/debug/CoachDebugPanel'
import { ReviewsTab } from './tabs/ReviewsTab'
import { PlanTab } from './workspace/PlanTab'
import { OnboardingTab } from './workspace/OnboardingTab'
import { ChatTab } from './workspace/ChatTab'
import { getUnreadCountAction } from './workspace/chat-actions'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

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
    metricDefinitions: MetricDefinition[]
    formTemplates: FormTemplate[]
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
    metricDefinitions,
    formTemplates,
}: NewClientWorkspaceProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'resumen')

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

    const handleRefresh = useCallback(() => {
        router.refresh()
    }, [router])

    const handleSwitchTab = useCallback((tab: string) => {
        setActiveTab(tab)
    }, [])

    const handleClientChange = (clientId: string) => {
        router.push(`/coach/clients?client=${clientId}&tab=${activeTab}`)
    }

    const isPendingSignup = selectedClient ? !selectedClient.auth_user_id : false

    // ── Unread message count for chat badge ──
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        if (!selectedClientId) return
        getUnreadCountAction(coachId, selectedClientId).then(setUnreadCount)
    }, [coachId, selectedClientId])

    // Realtime listener for unread badge (only when NOT on the chat tab)
    useEffect(() => {
        if (!selectedClientId) return
        const supabase = createBrowserClient()
        const channel = supabase
            .channel(`unread-badge:${coachId}:${selectedClientId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                const msg = payload.new as { client_id: string; sender_role: string }
                if (msg.client_id === selectedClientId && msg.sender_role === 'client' && activeTab !== 'chat') {
                    setUnreadCount(prev => prev + 1)
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coachId, selectedClientId, activeTab])

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
                        onClientUpdated={handleRefresh}
                    />

                    {/* NEW TAB STRUCTURE */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-6 mb-8 bg-transparent p-0 border-b border-zinc-800">
                            <TabsTrigger
                                value="onboarding"
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                            >
                                <ClipboardList className="h-4 w-4" />
                                <span className="hidden sm:inline">Onboarding</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="resumen"
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                            >
                                <LayoutDashboard className="h-4 w-4" />
                                <span className="hidden sm:inline">Resumen</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="plan"
                                disabled={isPendingSignup}
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <CalendarDays className="h-4 w-4" />
                                <span className="hidden sm:inline">Plan</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                            </TabsTrigger>
                            <TabsTrigger
                                value="checkins"
                                disabled={isPendingSignup}
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <FileText className="h-4 w-4" />
                                <span className="hidden sm:inline">Revisiones</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                            </TabsTrigger>
                            <TabsTrigger
                                value="progreso"
                                disabled={isPendingSignup}
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <TrendingUp className="h-4 w-4" />
                                <span className="hidden sm:inline">Progreso</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                            </TabsTrigger>
                            <TabsTrigger
                                value="chat"
                                disabled={isPendingSignup}
                                className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <MessageSquare className="h-4 w-4" />
                                <span className="hidden sm:inline">Chat</span>
                                {isPendingSignup && <Lock className="h-3 w-3 ml-1" />}
                                {!isPendingSignup && unreadCount > 0 && (
                                    <Badge variant="destructive" className="h-5 min-w-[20px] px-1 text-[10px] rounded-full ml-1">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-4 min-h-[500px]">
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
                                    clientStatus={clientStatus}
                                    latestCheckin={latestCheckin}
                                    activeMacroPlan={activeMacroPlan}
                                    activeProgram={activeProgram}
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

                            <TabsContent value="chat">
                                {isPendingSignup ? (
                                    <BlockedTabContent />
                                ) : (
                                    <ChatTab
                                        coachId={coachId}
                                        clientId={selectedClient.id}
                                        clientName={selectedClient.full_name || 'Cliente'}
                                        onUnreadChange={setUnreadCount}
                                    />
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
