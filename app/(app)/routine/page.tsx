import { createClient } from '@/lib/supabase/server'
import { getClientId, getActiveClientProgram } from '@/data/client-schedule'
import { resolveRoutineInitialSelection } from '@/lib/training/routine-defaults'
import RoutinePageClient from './RoutinePageClient'
import { Dumbbell } from 'lucide-react'

export default async function RoutinePage(
    props: {
        searchParams: Promise<{ week?: string; dayId?: string; date?: string; programId?: string }>
    }
) {
    const searchParams = await props.searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const clientId = await getClientId(user.id)

    if (!clientId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <h2 className="text-lg font-semibold mb-2">No hay perfil de cliente</h2>
                <p className="text-sm text-muted-foreground">
                    Tu cuenta no tiene un perfil de cliente asociado.
                    Contacta con tu entrenador.
                </p>
            </div>
        )
    }

    const data = await getActiveClientProgram(clientId, searchParams.programId)

    if (!data) {
        return (
            <div className="app-mobile-page min-h-screen">
                <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
                    <div className="px-4 pb-4 pt-4">
                        <div className="flex min-h-10 items-end pr-24">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fuerza</p>
                                <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">Rutina</h1>
                            </div>
                        </div>
                    </div>
                </header>
                <div className="px-4 pt-6">
                    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                            <Dumbbell className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold">Sin programa de fuerza</p>
                        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                            Tu coach aún no te ha asignado un programa. Aparecerá aquí en cuanto lo haga.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    const defaultSelection = resolveRoutineInitialSelection({
        program: data.program,
        days: data.days,
    })
    const parsedWeek = searchParams.week ? parseInt(searchParams.week) : null
    const initialWeek = parsedWeek && Number.isFinite(parsedWeek) ? parsedWeek : defaultSelection.week
    const initialDayId = searchParams.dayId || defaultSelection.dayId
    const initialSessionDate = searchParams.date || defaultSelection.sessionDate || undefined

    return (
        <RoutinePageClient
            clientId={clientId}
            program={data.program}
            days={data.days}
            columns={data.columns}
            exercises={data.exercises}
            initialCells={data.cells}
            initialSets={data.sets || []}
            initialWeek={initialWeek}
            initialDayId={initialDayId}
            initialSessionDate={initialSessionDate}
        />
    )
}
