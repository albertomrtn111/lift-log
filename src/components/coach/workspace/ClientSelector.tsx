'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import Link from 'next/link'
import type { ClientSelectorOption } from '@/data/workspace'

interface ClientSelectorProps {
    clients: ClientSelectorOption[]
    selectedClientId: string | null
}

function UrgencyDot({ client }: { client: ClientSelectorOption }) {
    if (client.hasOverdueCheckin) {
        return <span className="w-2 h-2 rounded-full bg-destructive shrink-0 animate-pulse" title="Revisión atrasada" />
    }
    if (client.hasPendingReview) {
        return <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Revisión pendiente" />
    }
    return null
}

export function ClientSelector({ clients, selectedClientId }: ClientSelectorProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')

    const selectedClient = useMemo(() =>
        clients.find(c => c.id === selectedClientId),
        [clients, selectedClientId]
    )

    const filteredClients = useMemo(() => {
        if (!search) return clients
        const lower = search.toLowerCase()
        return clients.filter(c => {
            const { displayName } = getClientDisplayIdentity(c)
            return displayName.toLowerCase().includes(lower) ||
                c.email.toLowerCase().includes(lower)
        })
    }, [clients, search])

    const activeClients = filteredClients.filter(c => c.status === 'active')
    const inactiveClients = filteredClients.filter(c => c.status !== 'active')

    const handleSelect = (clientId: string) => {
        router.push(`/coach/clients?client=${clientId}`)
        setOpen(false)
    }

    if (clients.length === 0) {
        return (
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="font-medium">No hay clientes</p>
                    <p className="text-sm text-muted-foreground">Crea tu primer cliente para empezar</p>
                </div>
                <Button variant="outline" size="sm" asChild className="ml-auto">
                    <Link href="/coach/members">Ir a Atletas</Link>
                </Button>
            </div>
        )
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full sm:w-[300px] justify-between"
                >
                    {selectedClient ? (
                        <div className="flex items-center gap-2 truncate">
                            <UrgencyDot client={selectedClient} />
                            <span className="truncate">{getClientDisplayIdentity(selectedClient).displayName}</span>
                            <Badge
                                variant="secondary"
                                className={cn(
                                    'shrink-0',
                                    selectedClient.status === 'active' && 'bg-success/10 text-success',
                                    selectedClient.status === 'inactive' && 'bg-muted'
                                )}
                            >
                                {selectedClient.status === 'active' ? 'Activo' : selectedClient.status === 'inactive' ? 'Inactivo' : selectedClient.status || 'Desconocido'}
                            </Badge>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">Seleccionar cliente...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command>
                    <CommandInput
                        placeholder="Buscar cliente..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                        {activeClients.length > 0 && (
                            <CommandGroup heading="Activos">
                                {activeClients.map(client => {
                                    const { displayName, initials } = getClientDisplayIdentity(client)
                                    return (
                                        <CommandItem
                                            key={client.id}
                                            value={`${displayName} ${client.email} ${client.id}`}
                                            onSelect={() => handleSelect(client.id)}
                                            className="cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 flex-1">
                                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                                                    {initials}
                                                </div>
                                                <UrgencyDot client={client} />
                                                <div className="truncate">
                                                    <p className="text-sm font-medium truncate">{displayName}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                                                </div>
                                            </div>
                                            <Check
                                                className={cn(
                                                    'h-4 w-4',
                                                    selectedClientId === client.id ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        )}
                        {inactiveClients.length > 0 && (
                            <CommandGroup heading="Inactivos / Otros">
                                {inactiveClients.map(client => {
                                    const { displayName, initials } = getClientDisplayIdentity(client)
                                    return (
                                        <CommandItem
                                            key={client.id}
                                            value={`${displayName} ${client.email} ${client.id}`}
                                            onSelect={() => handleSelect(client.id)}
                                            className="cursor-pointer opacity-60"
                                        >
                                            <div className="flex items-center gap-2 flex-1">
                                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                                    {initials}
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-sm font-medium truncate">{displayName}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                                                </div>
                                            </div>
                                            <Check
                                                className={cn(
                                                    'h-4 w-4',
                                                    selectedClientId === client.id ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
