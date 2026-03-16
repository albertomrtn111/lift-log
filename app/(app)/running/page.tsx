import { createClient } from '@/lib/supabase/server'
import { getClientId, getClientWeeklySchedule } from '@/data/client-schedule'
import RunningPageClient from './RunningPageClient'
import { startOfWeek, endOfWeek } from 'date-fns'

export default async function RunningPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // Resolve auth user → client record
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

    // Fetch current week
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

    const toDateStr = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }

    const items = await getClientWeeklySchedule(clientId, toDateStr(weekStart), toDateStr(weekEnd))

    return (
        <RunningPageClient
            initialItems={items}
            clientId={clientId}
            initialWeekStart={toDateStr(weekStart)}
        />
    )
}
