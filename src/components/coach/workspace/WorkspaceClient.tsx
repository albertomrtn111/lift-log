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
    Calendar,
    TrendingUp
} from 'lucide-react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { ClientSelector } from './ClientSelector'
import { ResumenTab } from './ResumenTab'
import { CheckinsTab } from './CheckinsTab'
import { PlanTab } from './PlanTab'
import { ProgresoTab } from './ProgresoTab'
import { CoachDebugPanel } from '@/components/debug/CoachDebugPanel'

interface ClientOption {
    id: string
    full_name: string
    email: string
    status: 'active' | 'inactive' | 'pending'
}

interface MetricData {
    metric_date: string
    weight_kg: number | null
    steps: number | null
    sleep_h: number | null
    training_adherence: number | null
    nutrition_adherence: number | null
}

interface WorkspaceClientProps {
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
    metrics: MetricData[]
    coachId: string
}

export function WorkspaceClient({
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
    metrics,
    coachId,
}: WorkspaceClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [activeTab, setActiveTab] = useState('resumen')

    const handleRefresh = useCallback(() => {
        router.refresh()
    }, [router])

    const handleSwitchTab = useCallback((tab: string) => {
        setActiveTab(tab)
    }, [])

    const selectedClientId = selectedClient?.id || searchParams.get('client')

    return (
        <div className="space-y-4">
            {/* Client Selector */}
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
                    {/* Header */}
                    <WorkspaceHeader
                        client={selectedClient}
                        clientStatus={clientStatus}
                        onClientUpdated={handleRefresh}
                    />

                    {/* Tabs */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="resumen" className="gap-2">
                                <LayoutDashboard className="h-4 w-4" />
                                <span className="hidden sm:inline">Resumen</span>
                            </TabsTrigger>
                            <TabsTrigger value="checkins" className="gap-2">
                                <FileText className="h-4 w-4" />
                                <span className="hidden sm:inline">Check-ins</span>
                            </TabsTrigger>
                            <TabsTrigger value="plan" className="gap-2">
                                <Calendar className="h-4 w-4" />
                                <span className="hidden sm:inline">Plan</span>
                            </TabsTrigger>
                            <TabsTrigger value="progreso" className="gap-2">
                                <TrendingUp className="h-4 w-4" />
                                <span className="hidden sm:inline">Progreso</span>
                            </TabsTrigger>
                        </TabsList>

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

                        <TabsContent value="checkins">
                            <CheckinsTab
                                coachId={coachId}
                                clientId={selectedClient.id}
                                checkins={checkins}
                                onRefresh={handleRefresh}
                            />
                        </TabsContent>

                        <TabsContent value="plan">
                            <PlanTab
                                coachId={coachId}
                                clientId={selectedClient.id}
                                activeMacroPlan={activeMacroPlan}
                                macroPlans={macroPlans}
                                activeDietPlan={activeDietPlan}
                                dietPlans={dietPlans}
                                activeProgram={activeProgram}
                                programs={programs}
                                onRefresh={handleRefresh}
                            />
                        </TabsContent>

                        <TabsContent value="progreso">
                            <ProgresoTab metrics={metrics} />
                        </TabsContent>
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
