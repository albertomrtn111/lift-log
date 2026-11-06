'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Video } from 'lucide-react'
import { StudioGroupPanel } from '@/components/coach/sala/StudioGroupPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StudioClientSummary, StudioGroupSummary, StudioProfessional } from '@/data/studio'
import { formatShortDate, normalizeText } from '@/lib/studio/grid-rules'
import { sortGroups } from '@/lib/studio/group-rules'
import { cn } from '@/lib/utils'

export function StudioClientList({ coachId, clients, groups, team, selectedId, selectedGroupId, currentUserId }: {
    coachId: string
    clients: StudioClientSummary[]
    groups: StudioGroupSummary[]
    team: StudioProfessional[]
    selectedId: string | null
    selectedGroupId: string | null
    currentUserId: string | null
}) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState<'clients' | 'groups'>(selectedGroupId ? 'groups' : 'clients')
    const [creating, setCreating] = useState(false)
    const shownGroups = useMemo(() => {
        const query = normalizeText(search)
        return (sortGroups(groups, currentUserId) as StudioGroupSummary[])
            .filter(group => !query || normalizeText(group.name).includes(query))
    }, [groups, search, currentUserId])

    const { today, others } = useMemo(() => {
        const query = normalizeText(search)
        const shown = clients.filter(client => !query || normalizeText(client.fullName).includes(query))
        return {
            today: shown.filter(client => client.sessionToday !== null),
            others: shown.filter(client => client.sessionToday === null),
        }
    }, [clients, search])

    return (
        <aside className="min-w-0 space-y-3" aria-label="Clientes y grupos">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="Ver">
                {([['clients', 'Clientes'], ['groups', 'Grupos']] as const).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tab === value}
                        onClick={() => setTab(value)}
                        className={cn(
                            'h-8 rounded-md text-sm font-medium',
                            tab === value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder={tab === 'clients' ? 'Buscar cliente…' : 'Buscar grupo…'}
                    className="pl-9"
                    aria-label={tab === 'clients' ? 'Buscar cliente' : 'Buscar grupo'}
                />
            </div>
            {tab === 'clients' ? (
                <div className="max-h-64 space-y-3 overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
                    {today.length > 0 && <ClientGroup title="Hoy en sala" clients={today} selectedId={selectedId} />}
                    {others.length > 0 && <ClientGroup title="Clientes" clients={others} selectedId={selectedId} />}
                    {today.length === 0 && others.length === 0 && (
                        <p className="p-2 text-sm text-muted-foreground">No hay clientes con ese nombre.</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto lg:max-h-[calc(100dvh-19rem)]">
                        {shownGroups.map(group => (
                            <li key={group.id}>
                                <Link
                                    href={`/coach/sala?grupo=${group.id}`}
                                    aria-current={group.id === selectedGroupId ? 'page' : undefined}
                                    className={cn(
                                        'block rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                                        group.id === selectedGroupId && 'bg-primary/10 font-medium text-primary'
                                    )}
                                >
                                    <span className="block truncate">{group.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {group.members} personas{group.nextSession ? ` · ${formatShortDate(group.nextSession)}` : ''}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {shownGroups.length === 0 && <p className="p-2 text-sm text-muted-foreground">Aún no hay grupos.</p>}
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setCreating(true)}>
                        <Plus className="mr-1 h-4 w-4" /> Nuevo grupo
                    </Button>
                </div>
            )}
            <Link
                href="/coach/sala/videos"
                className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
                <Video className="h-4 w-4" /> Vídeos de la sala
            </Link>
            {creating && (
                <StudioGroupPanel
                    coachId={coachId}
                    group={null}
                    groups={groups}
                    clients={clients}
                    team={team}
                    memberIds={[]}
                    onClose={() => setCreating(false)}
                    onSaved={groupId => {
                        setCreating(false)
                        router.push(`/coach/sala?grupo=${groupId}`)
                    }}
                />
            )}
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
