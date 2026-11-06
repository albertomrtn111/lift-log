import { redirect } from 'next/navigation'
import { AthleteSessionList } from '@/components/athlete/AthleteSessionList'
import { getClientId } from '@/data/client-schedule'
import { getAthleteModules } from '@/data/athlete-modules'
import { getAthleteSessions } from '@/data/athlete-sessions'
import { createClient } from '@/lib/supabase/server'

export default async function SesionesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const modules = await getAthleteModules()
    if (!modules.sessions) redirect('/routine')

    const clientId = await getClientId(user.id)
    const sessions = clientId ? await getAthleteSessions(clientId) : []

    return <AthleteSessionList sessions={sessions} />
}
