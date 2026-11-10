'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, UserPlus, Video } from 'lucide-react'
import { toast } from 'sonner'
import { StudioGroupPanel } from '@/components/coach/sala/StudioGroupPanel'
import { StudioNewClientPanel } from '@/components/coach/sala/StudioNewClientPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StudioClientSummary, StudioGroupSummary, StudioProfessional } from '@/data/studio'
import {
    adoptClientAction,
    findPeopleAction,
    type StudioPatientMatch,
    type StudioPersonMatch,
} from '@/lib/studio/client-actions'
import { birthdayInfo, defaultScope, nameKey, visibleClients } from '@/lib/studio/client-rules'
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
    const [scope, setScope] = useState<'mine' | 'all'>(() => defaultScope(clients, currentUserId))
    const [remote, setRemote] = useState<{ query: string; clients: StudioPersonMatch[]; patients: StudioPatientMatch[] } | null>(null)
    const [newClient, setNewClient] = useState<{ name: string; patient: StudioPatientMatch | null } | null>(null)
    const [isAdopting, startAdopting] = useTransition()
    const assignedAny = clients.some(client => client.professionalIds.length > 0)
    const proName = (id: string) => team.find(member => member.id === id)?.name ?? 'otro profesional'

    // Lo que no está en tu lista se busca en todo el espacio y en FisioTrack.
    const query = search.trim()
    useEffect(() => {
        if (tab !== 'clients' || nameKey(query).length < 2) return
        let current = true
        const timer = setTimeout(() => {
            findPeopleAction(coachId, query).then(result => {
                if (current && result.success) setRemote({ query, ...result.data })
            })
        }, 300)
        return () => { current = false; clearTimeout(timer) }
    }, [coachId, query, tab])

    function openClient(clientId: string) {
        setSearch('')
        setNewClient(null)
        router.push(`/coach/sala?cliente=${clientId}`)
        router.refresh()
    }

    function adopt(person: { id: string; full_name: string; active: boolean }) {
        startAdopting(async () => {
            const result = await adoptClientAction(person.id)
            if (!result.success) return void toast.error(result.error)
            toast.success(person.active ? `${person.full_name} queda también en tu lista.` : `${person.full_name} vuelve a estar activo.`)
            openClient(person.id)
        })
    }

    const shownGroups = useMemo(() => {
        const query = normalizeText(search)
        return (sortGroups(groups, currentUserId) as StudioGroupSummary[])
            .filter(group => !query || normalizeText(group.name).includes(query))
    }, [groups, search, currentUserId])

    const { today, others, fromOthers } = useMemo(() => {
        const shown = visibleClients(clients, { query: search, scope, userId: currentUserId })
        const ids = new Set(shown.map(client => client.id))
        return {
            today: shown.filter(client => client.sessionToday !== null),
            others: shown.filter(client => client.sessionToday === null),
            fromOthers: search.trim() && scope === 'mine'
                ? visibleClients(clients, { query: search, scope: 'all' }).filter(client => !ids.has(client.id))
                : [],
        }
    }, [clients, search, scope, currentUserId])

    const listed = new Set(clients.map(client => client.id))
    const found = remote && remote.query === query ? remote : null
    const hiddenOrInactive = (found?.clients ?? []).filter(person => !listed.has(person.id))
    const patients = found?.patients ?? []
    const exact = clients.some(client => nameKey(client.fullName) === nameKey(query))
    const suggesting = tab === 'clients' && nameKey(query).length >= 2

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
                    onKeyDown={event => {
                        if (event.key !== 'Enter' || tab !== 'clients' || !query) return
                        const all = [...today, ...others]
                        if (all.length === 1) openClient(all[0].id)
                        else if (all.length === 0 && fromOthers.length === 0 && patients.length === 0 && hiddenOrInactive.length === 0) {
                            setNewClient({ name: query, patient: null })
                        }
                    }}
                    placeholder={tab === 'clients' ? 'Buscar o dar de alta…' : 'Buscar grupo…'}
                    className="pl-9"
                    aria-label={tab === 'clients' ? 'Buscar o dar de alta un cliente' : 'Buscar grupo'}
                />
            </div>
            {tab === 'clients' && assignedAny && (
                <div className="flex gap-1 text-xs" role="group" aria-label="Qué clientes ver">
                    {([['mine', 'Míos'], ['all', 'Todo el centro']] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={scope === value}
                            onClick={() => setScope(value)}
                            className={cn(
                                'rounded-full border px-2.5 py-1',
                                scope === value ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
            {tab === 'clients' ? (
                <div className="max-h-64 space-y-3 overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
                    {today.length > 0 && <ClientGroup title="Hoy en sala" clients={today} selectedId={selectedId} />}
                    {others.length > 0 && <ClientGroup title={scope === 'mine' ? 'Mis clientes' : 'Clientes'} clients={others} selectedId={selectedId} />}
                    {today.length === 0 && others.length === 0 && !suggesting && (
                        <p className="p-2 text-sm text-muted-foreground">
                            {scope === 'mine' ? 'Aún no llevas a nadie. Mira «Todo el centro».' : 'No hay clientes con ese nombre.'}
                        </p>
                    )}
                    {suggesting && (
                        <div className="space-y-2 border-t pt-2">
                            {(fromOthers.length > 0 || hiddenOrInactive.some(person => person.active)) && (
                                <Suggestions title="De otros profesionales">
                                    {fromOthers.slice(0, 4).map(client => (
                                        <SuggestionButton
                                            key={client.id}
                                            name={client.fullName}
                                            detail={`lo lleva ${client.professionalIds.map(proName).join(', ')} · pulsa para compartirlo`}
                                            disabled={isAdopting}
                                            onClick={() => adopt({ id: client.id, full_name: client.fullName, active: true })}
                                        />
                                    ))}
                                    {hiddenOrInactive.filter(person => person.active).slice(0, 4).map(person => (
                                        <SuggestionButton
                                            key={person.id}
                                            name={person.full_name}
                                            detail={`lo lleva ${person.professionals.join(', ') || 'otro profesional'} · pulsa para compartirlo`}
                                            disabled={isAdopting}
                                            onClick={() => adopt(person)}
                                        />
                                    ))}
                                </Suggestions>
                            )}
                            {hiddenOrInactive.some(person => !person.active) && (
                                <Suggestions title="Dados de baja">
                                    {hiddenOrInactive.filter(person => !person.active).slice(0, 4).map(person => (
                                        <SuggestionButton
                                            key={person.id}
                                            name={person.full_name}
                                            detail="pulsa para reactivarlo"
                                            disabled={isAdopting}
                                            onClick={() => adopt(person)}
                                        />
                                    ))}
                                </Suggestions>
                            )}
                            {patients.length > 0 && (
                                <Suggestions title="En FisioTrack">
                                    {patients.slice(0, 5).map(patient => {
                                        const info = birthdayInfo(patient.birth_date, new Date().toISOString().slice(0, 10))
                                        return (
                                            <SuggestionButton
                                                key={patient.id}
                                                name={patient.full_name}
                                                detail={[info ? `${info.age} años` : '', 'crear y vincular su ficha'].filter(Boolean).join(' · ')}
                                                onClick={() => setNewClient({ name: patient.full_name, patient })}
                                            />
                                        )
                                    })}
                                </Suggestions>
                            )}
                            {!exact && (
                                <button
                                    type="button"
                                    onClick={() => setNewClient({ name: query, patient: null })}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent"
                                >
                                    <UserPlus className="h-4 w-4 shrink-0" />
                                    <span className="min-w-0 truncate">Dar de alta «{query}»</span>
                                </button>
                            )}
                        </div>
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
            {tab === 'clients' && !suggesting && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setNewClient({ name: '', patient: null })}>
                    <UserPlus className="mr-1 h-4 w-4" /> Nuevo cliente
                </Button>
            )}
            <Link
                href="/coach/sala/videos"
                className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
                <Video className="h-4 w-4" /> Vídeos de la sala
            </Link>
            {newClient && (
                <StudioNewClientPanel
                    coachId={coachId}
                    initialName={newClient.name}
                    patient={newClient.patient}
                    onClose={() => setNewClient(null)}
                    onDone={openClient}
                />
            )}
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

function Suggestions({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            <div className="space-y-0.5">{children}</div>
        </div>
    )
}

function SuggestionButton({ name, detail, disabled, onClick }: {
    name: string
    detail: string
    disabled?: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-60"
        >
            <span className="block truncate text-sm">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        </button>
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
