'use client'

import { useState, useMemo } from 'react'
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, Loader2, Users } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import Link from 'next/link'
import type { ClientSelectorOption } from '@/data/workspace'

interface ClientSelectorProps {
    clients: ClientSelectorOption[]
    selectedClientId: string | null
    onClientChange?: (clientId: string) => void
    isSwitching?: boolean
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

export function ClientSelector({ clients, selectedClientId, onClientChange, isSwitching = false }: ClientSelectorProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const isMobile = useIsMobile()

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
        if (clientId !== selectedClientId) {
            onClientChange?.(clientId)
        }
        setOpen(false)
        setSearch('')
    }

    if (clients.length === 0) {
        return (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="font-medium">No hay clientes</p>
                    <p className="text-sm text-muted-foreground">Crea tu primer cliente para empezar</p>
                </div>
                <Button variant="outline" size="sm" asChild className="w-full sm:ml-auto sm:w-auto">
                    <Link href="/coach/members">Ir a Atletas</Link>
                </Button>
            </div>
        )
    }

    const trigger = (
        <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isSwitching}
            onClick={isMobile ? () => setOpen(true) : undefined}
            className="h-10 w-full min-w-0 justify-between sm:w-[300px]"
        >
            {selectedClient ? (
                <div className="flex min-w-0 items-center gap-2">
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
                <span className="truncate text-muted-foreground">Seleccionar cliente...</span>
            )}
            {isSwitching ? (
                <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-70" />
            ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
        </Button>
    )

    const renderItem = (client: ClientSelectorOption, inactive: boolean) => {
        const { displayName, initials } = getClientDisplayIdentity(client)
        return (
            <CommandItem
                key={client.id}
                value={`${displayName} ${client.email} ${client.id}`}
                onSelect={() => handleSelect(client.id)}
                className={cn('cursor-pointer', isMobile && 'gap-1 py-3', inactive && 'opacity-60')}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className={cn(
                        'flex shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        isMobile ? 'h-9 w-9' : 'h-6 w-6',
                        inactive ? 'bg-muted' : 'bg-primary/20'
                    )}>
                        {initials}
                    </div>
                    {!inactive && <UrgencyDot client={client} />}
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                    </div>
                </div>
                <Check
                    className={cn(
                        'h-4 w-4 shrink-0',
                        selectedClientId === client.id ? 'opacity-100' : 'opacity-0'
                    )}
                />
            </CommandItem>
        )
    }

    const list = (
        <Command>
            <CommandInput
                placeholder="Buscar cliente..."
                value={search}
                onValueChange={setSearch}
            />
            <CommandList className={cn(isMobile && 'max-h-[60vh]')}>
                <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                {activeClients.length > 0 && (
                    <CommandGroup heading="Activos">
                        {activeClients.map(client => renderItem(client, false))}
                    </CommandGroup>
                )}
                {inactiveClients.length > 0 && (
                    <CommandGroup heading="Inactivos / Otros">
                        {inactiveClients.map(client => renderItem(client, true))}
                    </CommandGroup>
                )}
            </CommandList>
        </Command>
    )

    // Móvil: hoja inferior a pantalla casi completa. Sin autofocus en la búsqueda
    // para que el teclado no tape la lista nada más abrir.
    if (isMobile) {
        return (
            <>
                {trigger}
                <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
                    <SheetContent
                        side="bottom"
                        className="rounded-t-2xl px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-5"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                        <SheetHeader className="px-1 text-left">
                            <SheetTitle>Cambiar de cliente</SheetTitle>
                        </SheetHeader>
                        <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
                            {list}
                        </div>
                    </SheetContent>
                </Sheet>
            </>
        )
    }

    return (
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
            <PopoverTrigger asChild>
                {trigger}
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                {list}
            </PopoverContent>
        </Popover>
    )
}
