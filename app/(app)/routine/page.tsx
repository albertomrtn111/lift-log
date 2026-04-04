import { createClient } from '@/lib/supabase/server'
import { getClientId, getActiveClientProgram } from '@/data/client-schedule'
import RoutinePageClient from './RoutinePageClient'
import { Dumbbell } from 'lucide-react'

export default async function RoutinePage(
    props: {
        searchParams: Promise<{ week?: string; dayId?: string }>
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

    const data = await getActiveClientProgram(clientId)

    if (!data) {
        return (
            <div className="app-mobile-page min-h-screen">
                <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                    <div className="px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Dumbbell className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-foreground">Rutina</h1>
                                <p className="text-sm text-muted-foreground">Sin programa asignado</p>
                            </div>
                        </div>
                    </div>
                </header>
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                    <Dumbbell className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg mb-1">Sin programa de entrenamiento</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                        Tu entrenador aún no te ha asignado un programa de entrenamiento.
                    </p>
                </div>
            </div>
        )
    }

    const initialWeek = searchParams.week ? parseInt(searchParams.week) : 1
    const initialDayId = searchParams.dayId

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
        />
    )
}
