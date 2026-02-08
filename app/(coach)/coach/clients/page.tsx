import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { UserCog } from 'lucide-react'
import {
    getClientsForSelector,
    getClientForWorkspace,
    getClientStatus,
    getLatestCheckin,
    listCheckins,
    getActiveMacroPlan,
    listMacroPlans,
    getActiveDietPlan,
    listDietPlans,
    getActiveTrainingProgram,
    listTrainingPrograms,
    getClientMetrics,
} from '@/data/workspace'
import { WorkspaceClient } from '@/components/coach/workspace/WorkspaceClient'

interface PageProps {
    searchParams: Promise<{ client?: string }>
}

export default async function CoachClientsPage({ searchParams }: PageProps) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    // Get all clients for selector
    const clients = await getClientsForSelector(coachId)

    // Determine selected client
    const clientIdParam = params.client
    let selectedClientId = clientIdParam

    // If no client specified, use first active client
    if (!selectedClientId && clients.length > 0) {
        const firstActiveClient = clients.find(c => c.status === 'active')
        selectedClientId = firstActiveClient?.id || clients[0].id
    }

    // Fetch selected client data
    let selectedClient = null
    let clientStatus = null
    let latestCheckin = null
    let checkins: Awaited<ReturnType<typeof listCheckins>> = []
    let activeMacroPlan = null
    let macroPlans: Awaited<ReturnType<typeof listMacroPlans>> = []
    let activeDietPlan = null
    let dietPlans: Awaited<ReturnType<typeof listDietPlans>> = []
    let activeProgram = null
    let programs: Awaited<ReturnType<typeof listTrainingPrograms>> = []
    let metrics: Awaited<ReturnType<typeof getClientMetrics>> = []

    if (selectedClientId) {
        // Fetch all data in parallel
        const [
            clientData,
            statusData,
            latestCheckinData,
            checkinsData,
            macroPlanData,
            macroPlansData,
            dietPlanData,
            dietPlansData,
            programData,
            programsData,
            metricsData,
        ] = await Promise.all([
            getClientForWorkspace(coachId, selectedClientId),
            getClientStatus(coachId, selectedClientId),
            getLatestCheckin(coachId, selectedClientId),
            listCheckins(coachId, selectedClientId),
            getActiveMacroPlan(coachId, selectedClientId),
            listMacroPlans(coachId, selectedClientId),
            getActiveDietPlan(coachId, selectedClientId),
            listDietPlans(coachId, selectedClientId),
            getActiveTrainingProgram(coachId, selectedClientId),
            listTrainingPrograms(coachId, selectedClientId),
            getClientMetrics(coachId, selectedClientId, 90),
        ])

        selectedClient = clientData
        clientStatus = statusData
        latestCheckin = latestCheckinData
        checkins = checkinsData
        activeMacroPlan = macroPlanData
        macroPlans = macroPlansData
        activeDietPlan = dietPlanData
        dietPlans = dietPlansData
        activeProgram = programData
        programs = programsData
        metrics = metricsData
    }

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <UserCog className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Workspace</h1>
                            <p className="text-sm text-muted-foreground">Centro operativo por cliente</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
                <WorkspaceClient
                    clients={clients}
                    selectedClient={selectedClient}
                    clientStatus={clientStatus}
                    latestCheckin={latestCheckin}
                    checkins={checkins}
                    activeMacroPlan={activeMacroPlan}
                    macroPlans={macroPlans}
                    activeDietPlan={activeDietPlan}
                    dietPlans={dietPlans}
                    activeProgram={activeProgram}
                    programs={programs}
                    metrics={metrics}
                    coachId={coachId}
                />
            </div>
        </div>
    )
}
