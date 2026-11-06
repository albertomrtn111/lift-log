import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { StudioVideoFolder } from '@/components/coach/sala/StudioVideoFolder'
import { getStudioVideoFolder } from '@/data/studio'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { createClient } from '@/lib/supabase/server'

export default async function SalaVideosPage() {
    const coachId = await getActiveCoachId()
    if (!coachId) redirect('/coach/dashboard')

    const supabase = await createClient()
    const { data: enabled } = await supabase.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'studio_mode' })
    if (!enabled) redirect('/coach/dashboard')

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
    const folder = await getStudioVideoFolder(coachId, today)

    return (
        <div className="min-h-screen bg-background pb-24 lg:pb-8">
            <CoachPageHeader eyebrow="Sala" title="Vídeos" description="Vídeos de técnica para toda la sala o para un cliente." />
            <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
                <Link href="/coach/sala" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary">
                    <ChevronLeft className="h-4 w-4" /> Sala
                </Link>
                <StudioVideoFolder coachId={coachId} folder={folder} />
            </div>
        </div>
    )
}
