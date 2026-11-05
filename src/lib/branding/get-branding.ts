import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isReadablePrimary, NEXTRAIN_PRIMARY } from '@/lib/branding/branding-rules'

export interface WorkspaceBranding {
    coach_id: string
    display_name: string | null
    primary_color: string | null
    accent_color: string | null
    logo_light_url: string | null
    logo_dark_url: string | null
    icon_url: string | null
    report_footer: string | null
}

export interface EmailBrand {
    name: string | null
    logoUrl: string | null
    color: string
}

/** Look & feel de quien ha entrado, una vez por petición. Null si se ve la marca NexTrain. */
export const getMyBranding = cache(async (): Promise<WorkspaceBranding | null> => {
    try {
        const supabase = await createClient()
        const { data } = await supabase.rpc('my_workspace_branding').maybeSingle()
        return (data as WorkspaceBranding | null) ?? null
    } catch {
        return null
    }
})

/** Marca de los emails de un espacio. Un fallo aquí nunca impide enviar el email. */
export async function getEmailBrand(coachId: string): Promise<EmailBrand | null> {
    try {
        const admin = createAdminClient()
        const [{ data: enabled }, { data }] = await Promise.all([
            admin.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'branding' }),
            admin
                .from('workspace_branding')
                .select('display_name, primary_color, logo_light_url')
                .eq('coach_id', coachId)
                .maybeSingle(),
        ])
        if (!enabled || !data) return null
        return {
            name: data.display_name,
            logoUrl: data.logo_light_url,
            color: isReadablePrimary(data.primary_color) ? (data.primary_color as string) : NEXTRAIN_PRIMARY,
        }
    } catch {
        return null
    }
}
