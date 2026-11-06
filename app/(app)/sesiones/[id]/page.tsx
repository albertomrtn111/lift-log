import { notFound } from 'next/navigation'
import { AthleteSessionView } from '@/components/athlete/AthleteSessionView'
import { getClientId } from '@/data/client-schedule'
import { getAthleteSession } from '@/data/athlete-sessions'
import { createClient } from '@/lib/supabase/server'

export default async function SesionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const clientId = await getClientId(user.id)
    const session = clientId ? await getAthleteSession(clientId, id) : null
    if (!session) notFound()

    return <AthleteSessionView session={session} />
}
