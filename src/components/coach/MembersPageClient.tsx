'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClientWithMeta } from '@/types/coach'
import { FormTemplate } from '@/types/forms'
import type { ReviewTemplate } from '@/data/review-templates'
import type { StatusFilter } from '@/data/members'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Users, UserX, UsersRound } from 'lucide-react'
import { MembersTable } from './MembersTable'
import { AddClientButton } from './AddClientButton'

interface MembersPageClientProps {
    clients: ClientWithMeta[]
    coachId: string
    initialStatusFilter: StatusFilter
    initialSearch: string
    formTemplates: FormTemplate[]
    reviewTemplates?: ReviewTemplate[]
}

export function MembersPageClient({
    clients,
    coachId,
    initialStatusFilter,
    initialSearch,
    formTemplates,
    reviewTemplates,
}: MembersPageClientProps) {
    const router = useRouter()
    const [search, setSearch] = useState(initialSearch)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter)

    const updateFilters = (newStatus?: StatusFilter, newSearch?: string) => {
        const params = new URLSearchParams()
        const status = newStatus ?? statusFilter
        const searchTerm = newSearch ?? search

        if (status !== 'all') params.set('status', status)
        if (searchTerm) params.set('search', searchTerm)

        router.push(`/coach/members${params.toString() ? '?' + params.toString() : ''}`)
    }

    const handleStatusChange = (value: string) => {
        setStatusFilter(value as StatusFilter)
        updateFilters(value as StatusFilter, search)
    }

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        updateFilters(statusFilter, search)
    }

    const handleSearchClear = () => {
        setSearch('')
        updateFilters(statusFilter, '')
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <Card className="p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                    {/* Status filter tabs */}
                    <Tabs value={statusFilter} onValueChange={handleStatusChange} className="w-full sm:w-auto">
                        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                            <TabsTrigger value="all" className="gap-1.5 px-2 sm:gap-2 sm:px-3">
                                <UsersRound className="h-4 w-4 shrink-0" />
                                <span>Todos</span>
                            </TabsTrigger>
                            <TabsTrigger value="active" className="gap-1.5 px-2 sm:gap-2 sm:px-3">
                                <Users className="h-4 w-4 shrink-0" />
                                <span>Activos</span>
                            </TabsTrigger>
                            <TabsTrigger value="inactive" className="gap-1.5 px-2 sm:gap-2 sm:px-3">
                                <UserX className="h-4 w-4 shrink-0" />
                                <span>Inactivos</span>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="flex min-w-0 flex-1 gap-2">
                        {/* Search */}
                        <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 gap-2">
                            <div className="relative min-w-0 flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    enterKeyHint="search"
                                    placeholder="Buscar por nombre o email..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            {search && (
                                <Button type="button" variant="ghost" size="sm" onClick={handleSearchClear} className="h-10 shrink-0 px-2 sm:px-3">
                                    Limpiar
                                </Button>
                            )}
                        </form>

                        {/* Add client button */}
                        <AddClientButton coachId={coachId} formTemplates={formTemplates} />
                    </div>
                </div>
            </Card>

            {/* Table */}
            <MembersTable clients={clients} statusFilter={statusFilter} coachId={coachId} formTemplates={formTemplates} reviewTemplates={reviewTemplates} />
        </div>
    )
}
