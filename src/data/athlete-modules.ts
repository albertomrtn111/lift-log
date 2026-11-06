import 'server-only'

import { cache } from 'react'
import { athleteModules } from '@/lib/athlete/module-rules'
import { createClient } from '@/lib/supabase/server'

/** Qué ve en la app quien ha entrado, una vez por petición. */
export const getAthleteModules = cache(async () => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('my_athlete_modules')
    if (error) console.error('[athlete-modules]', error.message)
    return athleteModules(data)
})
