'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { StudioClientSummary } from '@/data/studio'
import { normalizeText } from '@/lib/studio/grid-rules'
import { cn } from '@/lib/utils'

export function StudioClientList({ clients, selectedId }: { clients: StudioClientSummary[]; selectedId: string | null }) {
    const [search, setSearch] = useState('')

    const { today, others } = useMemo(() => {
        const query = normalizeText(search)
        const shown = clients.filter(client => !query || normalizeText(client.fullName).includes(query))
        return {
            today: shown.filter(client => client.sessionToday !== null),
            others: shown.filter(client => client.sessionToday === null),
        }
    }, [clients, search])

    return (
        <aside className="min-w-0 space-y-3" aria-label="Clientes">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Buscar cliente…"
                    className="pl-9"
                    aria-label="Buscar cliente"
                />
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
                {today.length > 0 && <ClientGroup title="Hoy en sala" clients={today} selectedId={selectedId} />}
                {others.length > 0 && <ClientGroup title="Clientes" clients={others} selectedId={selectedId} />}
                {today.length === 0 && others.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">No hay clientes con ese nombre.</p>
                )}
            </div>
        </aside>
    )
}

function ClientGroup({ title, clients, selectedId }: {
    title: string
    clients: StudioClientSummary[]
    selectedId: string | null
}) {
    return (
        <div>
            <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            <ul className="space-y-0.5">
                {clients.map(client => (
                    <li key={client.id}>
                        <Link
                            href={`/coach/sala?cliente=${client.id}`}
                            aria-current={client.id === selectedId ? 'page' : undefined}
                            className={cn(
                                'flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                                client.id === selectedId && 'bg-primary/10 font-medium text-primary'
                            )}
                        >
                            <span className="min-w-0 truncate">{client.fullName}</span>
                            {client.sessionToday && (
                                <span className="shrink-0 text-xs text-muted-foreground">{client.sessionToday.slice(0, 5)}</span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}
