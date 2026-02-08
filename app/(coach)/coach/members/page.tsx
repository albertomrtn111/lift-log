import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getClients, StatusFilter } from '@/data/members'
import { MembersPageClient } from '@/components/coach/MembersPageClient'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'

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

    const clients = await getClients({ coachId, statusFilter, search })
    const activeCount = clients.filter(c => c.status === 'active').length
    const inactiveCount = clients.filter(c => c.status === 'inactive').length

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Miembros</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                                    {activeCount} activos
                                </Badge>
                                <Badge variant="outline">{inactiveCount} inactivos</Badge>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
                <MembersPageClient
                    clients={clients}
                    coachId={coachId}
                    initialStatusFilter={statusFilter}
                    initialSearch={search}
                />
            </div>
        </div>
    )
}
