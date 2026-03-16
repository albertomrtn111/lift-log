import { createClient } from '@/lib/supabase/server'
import { getClientId, getActiveClientProgram, getClientWeeklySchedule } from '@/data/client-schedule'
import PlanningPageClient from './PlanningPageClient'
import { startOfWeek, endOfWeek, addWeeks, differenceInCalendarWeeks } from 'date-fns'

export default async function PlanningPage() {
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

    const programData = await getActiveClientProgram(clientId)

    // Default to current calendar week if no program
    let initialItems: any[] = []
    let initialWeek = 1
    let program = null

    if (programData) {
        program = {
            id: programData.program.id,
            name: programData.program.name,
            totalWeeks: programData.program.totalWeeks,
            effectiveFrom: programData.program.effectiveFrom,
        }

        // Calculate current week of the program
        const today = new Date()
        const startDate = new Date(program.effectiveFrom)
        const diffWeeks = differenceInCalendarWeeks(today, startDate, { weekStartsOn: 1 })

        // Clamp week between 1 and totalWeeks
        initialWeek = Math.max(1, Math.min(diffWeeks + 1, program.totalWeeks))

        // Calculate date range for this week
        // We assume effectiveFrom is a Monday or we align it to Monday
        const weekStart = startOfWeek(
            addWeeks(startDate, initialWeek - 1),
            { weekStartsOn: 1 }
        )
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

        const toDateStr = (d: Date) => {
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
        }

        initialItems = await getClientWeeklySchedule(clientId, toDateStr(weekStart), toDateStr(weekEnd))
    }

    return (
        <PlanningPageClient
            program={program}
            initialItems={initialItems}
            clientId={clientId}
            initialWeek={initialWeek}
        />
    )
}
