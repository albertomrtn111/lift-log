import { createClient } from '@/lib/supabase/server'
import { getClientId, getClientWeeklySchedule } from '@/data/client-schedule'
import PlanningPageClient from './PlanningPageClient'
import { startOfWeek, endOfWeek } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachDisplayName } from '@/lib/onboarding/athlete-welcome-data'
import { PlanInPreparation } from '@/components/planning/PlanInPreparation'

/** Devuelve el nombre del coach si el atleta aún no tiene ningún plan (entreno, dieta, macros ni cardio) */
async function getPlanInPreparation(clientId: string): Promise<{ coachName: string } | null> {
    const admin = createAdminClient()
    const { data: client } = await admin.from('clients').select('coach_id').eq('id', clientId).maybeSingle()
    if (!client) return null
    const counts = await Promise.all(
        ['training_programs', 'diet_plans', 'macro_plans', 'cardio_sessions'].map(table =>
            admin.from(table).select('id', { count: 'exact', head: true }).eq('client_id', clientId)
        )
    )
    if (counts.some(result => result.error || (result.count ?? 0) > 0)) return null
    return { coachName: await getCoachDisplayName(client.coach_id as string) }
}

const toDateStr = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

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

    // Sin ningún plan todavía: en lugar de un calendario vacío, "plan en preparación"
    const waiting = await getPlanInPreparation(clientId)
    if (waiting) return <PlanInPreparation coachName={waiting.coachName} />

    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
    const initialItems = await getClientWeeklySchedule(clientId, toDateStr(weekStart), toDateStr(weekEnd))

    return (
        <PlanningPageClient
            initialItems={initialItems}
            clientId={clientId}
            initialDate={toDateStr(today)}
        />
    )
}
