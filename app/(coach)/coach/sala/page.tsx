import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CoachNotificationsBell } from '@/components/coach/notifications/CoachNotificationsBell'
import { StudioClientList } from '@/components/coach/sala/StudioClientList'
import { StudioGrid } from '@/components/coach/sala/StudioGrid'
import { StudioMyJumpImport } from '@/components/coach/sala/StudioMyJumpImport'
import { StudioPendingReports } from '@/components/coach/sala/StudioPendingReports'
import { Card } from '@/components/ui/card'
import { getStudioClients, getStudioGrid, getStudioGroupGrid, getStudioGroups, getStudioPendingReports, getStudioTeamList } from '@/data/studio'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { createClient } from '@/lib/supabase/server'

interface SalaPageProps {
    searchParams: Promise<{ cliente?: string; grupo?: string; anteriores?: string }>
}

function todayInMadrid() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date())
}

export default async function SalaPage({ searchParams }: SalaPageProps) {
    const coachId = await getActiveCoachId()
    if (!coachId) redirect('/coach/dashboard')

    const supabase = await createClient()
    const { data: enabled } = await supabase.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'studio_mode' })
    if (!enabled) redirect('/coach/dashboard')

    const { data: { user } } = await supabase.auth.getUser()
    const { cliente, grupo, anteriores } = await searchParams
    const today = todayInMadrid()
    const uuid = /^[0-9a-f-]{36}$/i
    const [clients, groups, team, pendingReports] = await Promise.all([
        getStudioClients(coachId, today),
        getStudioGroups(coachId, today),
        getStudioTeamList(coachId),
        getStudioPendingReports(coachId, today),
    ])
    const grid = grupo && uuid.test(grupo)
        ? await getStudioGroupGrid(coachId, grupo)
        : cliente && uuid.test(cliente)
            ? await getStudioGrid(coachId, cliente)
            : null

    return (
        <div className="min-h-screen bg-background pb-24 lg:pb-8">
            {/* Sin cabecera: la sala empieza arriba. En el móvil la campana de avisos se queda aquí. */}
            <h1 className="sr-only">Sesiones de la sala</h1>
            <div className="flex justify-end px-4 pt-3 lg:hidden">
                <CoachNotificationsBell />
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-6">
                <div className={grid ? 'hidden space-y-3 lg:block' : 'space-y-3'}>
                    <StudioPendingReports reports={pendingReports} />
                    <StudioMyJumpImport
                        className="w-full"
                        clients={clients.map(client => ({ id: client.id, name: client.fullName }))}
                    />
                    <StudioClientList
                        coachId={coachId}
                        clients={clients}
                        groups={groups}
                        team={team}
                        selectedId={grid && !grid.group ? grid.client.id : null}
                        selectedGroupId={grid?.group?.id ?? null}
                        currentUserId={user?.id ?? null}
                    />
                </div>
                {grid ? (
                    <div className="min-w-0 space-y-2">
                        <Link href="/coach/sala" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary lg:hidden">
                            <ChevronLeft className="h-4 w-4" /> {grid.group ? 'Grupos' : 'Clientes'}
                        </Link>
                        <StudioGrid
                            key={grid.client.id}
                            data={grid}
                            today={today}
                            currentUserId={user?.id ?? null}
                            olderPages={Number(anteriores) > 0 ? Number(anteriores) : 0}
                            clients={clients}
                            allGroups={groups}
                        />
                    </div>
                ) : (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        {clients.length === 0 ? 'Aún no hay clientes en este espacio.' : 'Elige un cliente para ver sus sesiones.'}
                    </Card>
                )}
            </div>
        </div>
    )
}
