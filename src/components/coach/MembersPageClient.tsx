'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClientWithMeta } from '@/types/coach'
import { FormTemplate } from '@/types/forms'
import type { ReviewTemplate } from '@/data/review-templates'
import type { StatusFilter } from '@/data/members'
import { Input } from '@/components/ui/input'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'
import { Search } from 'lucide-react'
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
    const searchParams = useSearchParams()
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
            {/* Filtros */}
            <div className="space-y-2.5">
                <div className="flex min-w-0 gap-2">
                    <form onSubmit={handleSearchSubmit} className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            enterKeyHint="search"
                            placeholder="Buscar por nombre o email"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-10 rounded-full border-border/70 bg-muted/40 pl-9 pr-16"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={handleSearchClear}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                Limpiar
                            </button>
                        )}
                    </form>
                    <AddClientButton coachId={coachId} formTemplates={formTemplates} defaultOpen={searchParams.get('invite') === '1'} />
                </div>
                <ClientTabSwitcher
                    className="sm:max-w-md"
                    value={statusFilter}
                    onValueChange={(value) => handleStatusChange(value)}
                    options={[
                        { value: 'all', label: 'Todos' },
                        { value: 'active', label: 'Activos' },
                        { value: 'inactive', label: 'Inactivos' },
                    ]}
                />
            </div>

            {/* Table */}
            <MembersTable clients={clients} statusFilter={statusFilter} coachId={coachId} formTemplates={formTemplates} reviewTemplates={reviewTemplates} />
        </div>
    )
}
