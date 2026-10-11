import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getClients, StatusFilter } from '@/data/members'
import { getFormTemplates } from '@/data/form-templates'
import { listReviewTemplates } from '@/data/review-templates'
import { MembersPageClient } from '@/components/coach/MembersPageClient'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'

interface MembersPageProps {
    searchParams: Promise<{ status?: string; search?: string }>
}

export default async function MembersPage({ searchParams }: MembersPageProps) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const statusFilter = (params.status as StatusFilter) || 'all'
    const search = params.search || ''

    const [clients, formTemplates, reviewTemplates] = await Promise.all([
        getClients({ coachId, statusFilter, search }),
        getFormTemplates(),
        listReviewTemplates(coachId),
    ])
    const activeCount = clients.filter(c => c.status === 'active').length
    const inactiveCount = clients.filter(c => c.status === 'inactive').length

    return (
        <div className="min-h-screen min-w-0 pb-28 lg:pb-4">
            <CoachPageHeader
                eyebrow="Gestión"
                title="Atletas"
                description={
                    <>
                        <span className="font-medium text-success">{activeCount} activos</span>
                        <span className="text-muted-foreground"> · {inactiveCount} inactivos</span>
                    </>
                }
            />

            <div className="min-w-0 px-4 pt-4 lg:px-8 lg:pt-6">
                <MembersPageClient
                    clients={clients}
                    coachId={coachId}
                    initialStatusFilter={statusFilter}
                    initialSearch={search}
                    formTemplates={formTemplates}
                    reviewTemplates={reviewTemplates}
                />
            </div>
        </div>
    )
}
