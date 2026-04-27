import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getFormTemplates } from '@/data/form-templates'
import { getActiveClients } from '@/data/members'
import { FormsPageClient } from '@/components/coach/forms/FormsPageClient'
import { ClipboardList } from 'lucide-react'

export default async function FormsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const [templates, activeClients] = await Promise.all([
        getFormTemplates(),
        getActiveClients(coachId),
    ])

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <ClipboardList className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Formularios</h1>
                            <p className="text-sm text-muted-foreground">
                                Gestiona plantillas de revisión, onboarding y formularios generales
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
                <FormsPageClient templates={templates} activeClients={activeClients} />
            </div>
        </div>
    )
}
