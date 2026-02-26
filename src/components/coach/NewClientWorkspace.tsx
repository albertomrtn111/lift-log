'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client } from '@/types/coach'
import {
    ClientStatus,
    CheckinWithReview,
    MacroPlan,
    TrainingProgram,
    DietPlan
} from '@/data/workspace'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import {
    LayoutDashboard,
    FileText,
    TrendingUp,
    CalendarDays,
    Lock
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

interface ClientOption {
    id: string
    full_name: string
    email: string
    status: 'active' | 'inactive' | 'pending'
    auth_user_id: string | null
}

interface MetricData {
    metric_date: string
    weight_kg: number | null
    steps: number | null
    sleep_h: number | null
    training_adherence: number | null
    nutrition_adherence: number | null
}

interface NewClientWorkspaceProps {
    clients: ClientOption[]
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
}: NewClientWorkspaceProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Default to 'planning' if no tab is selected, or use the query param
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'planning')

    const handleRefresh = useCallback(() => {
        router.refresh()
    }, [router])

    const handleSwitchTab = useCallback((tab: string) => {
        setActiveTab(tab)
    }, [])

    const selectedClientId = selectedClient?.id || searchParams.get('client')

    // Handle client selection via URL
    const handleClientChange = (clientId: string) => {
        router.push(`/coach/clients?client=${clientId}&tab=${activeTab}`)
    }

    const isPendingSignup = selectedClient ? !selectedClient.auth_user_id : false

    // Blocked tab content for pending signup clients
    const BlockedTabContent = () => (
        <Card className="p-12 text-center">
            <Lock className="h-12 w-12 text-amber-500/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Feature locked</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
                This client hasn&apos;t signed up yet. Planning features will be unlocked once they create their account through the invitation link.
            </p>
        </Card>
    )

    return (
        <div className="space-y-4">
            {/* Client Selector & Header */}
            <div className="flex items-center gap-4">
                <ClientSelector
                    clients={clients}
                    selectedClientId={selectedClientId}
                />
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
                        <TabsList className="grid w-full grid-cols-4 mb-8 bg-transparent p-0 border-b border-zinc-800">
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
                        </TabsList>

                        <div className="mt-4 min-h-[500px]">
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
