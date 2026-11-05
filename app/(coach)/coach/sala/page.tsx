import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
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

    const { data: { user } } = await supabase.auth.getUser()
    const { cliente, anteriores } = await searchParams
    const today = todayInMadrid()
    const clients = await getStudioClients(coachId, today)
    const grid = cliente && /^[0-9a-f-]{36}$/i.test(cliente) ? await getStudioGrid(coachId, cliente) : null

    return (
        <div className="min-h-screen bg-background pb-24 lg:pb-8">
            <CoachPageHeader eyebrow="Operativa" title="Sala" description="Sesiones presenciales de tus clientes." />
            <div className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-6">
                <div className={grid ? 'hidden lg:block' : undefined}>
                    <StudioClientList clients={clients} selectedId={grid?.client.id ?? null} />
                </div>
                {grid ? (
                    <div className="min-w-0 space-y-2">
                        <Link href="/coach/sala" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary lg:hidden">
                            <ChevronLeft className="h-4 w-4" /> Clientes
                        </Link>
                        <StudioGrid
                            key={grid.client.id}
                            data={grid}
                            today={today}
                            currentUserId={user?.id ?? null}
                            olderPages={Number(anteriores) > 0 ? Number(anteriores) : 0}
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
