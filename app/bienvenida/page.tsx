import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAthleteWelcomeData } from '@/lib/onboarding/athlete-welcome-data'
import { linkPendingClientForUser } from '@/lib/onboarding/link-client-account'
import { AthleteWelcome } from './AthleteWelcome'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Bienvenida | NexTrain' }

/**
 * Bienvenida del atleta invitado: crear contraseña y cuatro pasos
 * (instalar la app, avisos, reloj y formulario del coach).
 */
export default async function BienvenidaPage({ searchParams }: { searchParams: Promise<{ strava?: string; paso?: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/bienvenida')

    // Quien ya tenía cuenta llega aquí con el enlace mágico de la invitación
    await linkPendingClientForUser(user)
    const data = await getAthleteWelcomeData(user.id)
    if (!data || !data.guided) redirect('/planning')
    if (data.steps.complete && !data.needsPassword) redirect('/planning')

    const params = await searchParams
    return (
        <AthleteWelcome
            data={data}
            email={user.email ?? ''}
            stravaResult={params.strava === 'connected' ? 'connected' : params.strava === 'error' ? 'error' : null}
        />
    )
}
