import { redirect } from 'next/navigation'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { StudioClientList } from '@/components/coach/sala/StudioClientList'
import { StudioGrid } from '@/components/coach/sala/StudioGrid'
import { Card } from '@/components/ui/card'
import { getStudioClients, getStudioGrid } from '@/data/studio'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { createClient } from '@/lib/supabase/server'

interface SalaPageProps {
    searchParams: Promise<{ cliente?: string; anteriores?: string }>
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

    const { cliente, anteriores } = await searchParams
    const today = todayInMadrid()
    const clients = await getStudioClients(coachId, today)
    const grid = cliente && /^[0-9a-f-]{36}$/i.test(cliente) ? await getStudioGrid(coachId, cliente) : null

    return (
        <div className="min-h-screen bg-background pb-24 lg:pb-8">
            <CoachPageHeader eyebrow="Operativa" title="Sala" description="Sesiones presenciales de tus clientes." />
            <div className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-6">
                <StudioClientList clients={clients} selectedId={grid?.client.id ?? null} />
                {grid ? (
                    <StudioGrid
                        key={grid.client.id}
                        data={grid}
                        today={today}
                        olderPages={Number(anteriores) > 0 ? Number(anteriores) : 0}
                    />
                ) : (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        {clients.length === 0 ? 'Aún no hay clientes en este espacio.' : 'Elige un cliente para ver sus sesiones.'}
                    </Card>
                )}
            </div>
        </div>
    )
}
