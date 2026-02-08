import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveUserMode } from '@/lib/auth/get-user-context'
import { getModeRedirectPath } from '@/lib/mode-utils'
import { SelectModeClient } from './SelectModeClient'

export default async function SelectModePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const modeResolution = await resolveUserMode(user.id)

    // Redirect if not "both"
    if (modeResolution === 'coach') {
        redirect(getModeRedirectPath('coach'))
    }

    if (modeResolution === 'client') {
        redirect(getModeRedirectPath('client'))
    }

    if (modeResolution === 'none') {
        redirect('/no-access')
    }

    // Only render the selector if resolution is "both"
    return <SelectModeClient />
}
