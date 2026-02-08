import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { resolveUserMode } from '@/lib/auth/get-user-context'
import { APP_MODE_COOKIE, LAST_MODE_COOKIE, type AppMode, getModeRedirectPath } from '@/lib/mode-utils'

export default async function HomePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get resolution: client, coach, both, or none
    const modeResolution = await resolveUserMode(user.id)

    // Handle based on resolution
    if (modeResolution === 'none') {
        redirect('/no-access')
    }

    if (modeResolution === 'coach') {
        redirect('/coach/dashboard')
    }

    if (modeResolution === 'client') {
        redirect('/routine')
    }

    if (modeResolution === 'both') {
        const cookieStore = await cookies()
        const lastMode = cookieStore.get(LAST_MODE_COOKIE)?.value as AppMode | undefined
        const currentMode = cookieStore.get(APP_MODE_COOKIE)?.value as AppMode | undefined

        // If we have a preferred mode already set in either cookie, go there
        const targetMode = currentMode || lastMode

        if (targetMode === 'coach' || targetMode === 'client') {
            redirect(getModeRedirectPath(targetMode))
        }

        // Default for dual users is Client view
        redirect('/routine')
    }

    // Fallback
    redirect('/profile')
}
