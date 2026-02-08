'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClientWithMeta } from '@/types/coach'
import { StatusFilter } from '@/data/members'
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
}

export function MembersPageClient({
    clients,
    coachId,
    initialStatusFilter,
    initialSearch
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
            <Card className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Status filter tabs */}
                    <Tabs value={statusFilter} onValueChange={handleStatusChange} className="w-full sm:w-auto">
                        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                            <TabsTrigger value="all" className="gap-2">
                                <UsersRound className="h-4 w-4" />
                                <span className="hidden sm:inline">Todos</span>
                            </TabsTrigger>
                            <TabsTrigger value="active" className="gap-2">
                                <Users className="h-4 w-4" />
                                <span className="hidden sm:inline">Activos</span>
                            </TabsTrigger>
                            <TabsTrigger value="inactive" className="gap-2">
                                <UserX className="h-4 w-4" />
                                <span className="hidden sm:inline">Inactivos</span>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {/* Search */}
                    <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nombre o email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        {search && (
                            <Button type="button" variant="ghost" size="sm" onClick={handleSearchClear}>
                                Limpiar
                            </Button>
                        )}
                    </form>

                    {/* Add client button */}
                    <AddClientButton coachId={coachId} />
                </div>
            </Card>

            {/* Table */}
            <MembersTable clients={clients} statusFilter={statusFilter} />
        </div>
    )
}
