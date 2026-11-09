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
import { Check, ChevronDown, ChevronsUpDown, Loader2, Users } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import { AthleteAvatar } from '../AthleteAvatar'
import Link from 'next/link'
import type { ClientSelectorOption } from '@/data/workspace'

interface ClientSelectorProps {
    clients: ClientSelectorOption[]
    selectedClientId: string | null
    onClientChange?: (clientId: string) => void
    isSwitching?: boolean
    /** «identity»: el atleta (foto, nombre y estado) es el propio botón para cambiar */
    variant?: 'compact' | 'identity'
    /** Línea bajo el nombre en la variante identity (email, próxima revisión…) */
    subline?: React.ReactNode
    /** Etiqueta pequeña sobre el nombre en la variante identity */
    eyebrow?: React.ReactNode
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

export function ClientSelector({ clients, selectedClientId, onClientChange, isSwitching = false, variant = 'compact', subline, eyebrow }: ClientSelectorProps) {
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

    const compactTrigger = (
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
                    <AthleteAvatar
                        initials={getClientDisplayIdentity(selectedClient).initials}
                        avatarUrl={selectedClient.avatar_url}
                        className="h-6 w-6"
                        fallbackClassName="bg-primary/20 text-[10px] font-bold"
                    />
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

    const statusLabel = selectedClient?.status === 'active' ? 'Activo' : selectedClient?.status === 'inactive' ? 'Inactivo' : selectedClient?.status || 'Desconocido'
    const identityTrigger = selectedClient ? (
        <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={`Cambiar de atleta. Ahora: ${getClientDisplayIdentity(selectedClient).displayName}`}
            disabled={isSwitching}
            onClick={isMobile ? () => setOpen(true) : undefined}
            className="group flex w-full min-w-0 items-center gap-3 rounded-2xl text-left transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:gap-4"
        >
            <AthleteAvatar
                initials={getClientDisplayIdentity(selectedClient).initials}
                avatarUrl={selectedClient.avatar_url}
                seed={getClientDisplayIdentity(selectedClient).displayName}
                className="h-11 w-11 shrink-0 ring-1 ring-border sm:h-14 sm:w-14"
                fallbackClassName="text-[15px] sm:text-[18px]"
            />
            <span className="min-w-0 flex-1">
                {eyebrow && <span className="nt-eyebrow hidden truncate text-[10.5px] text-muted-foreground sm:block">{eyebrow}</span>}
                <span className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span className="nt-display truncate text-[1.35rem] text-foreground sm:text-[1.9rem]">
                        {getClientDisplayIdentity(selectedClient).displayName}
                    </span>
                    <span className={cn(
                        'hidden shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold sm:inline-flex',
                        selectedClient.status === 'active' ? 'bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-300' : 'bg-foreground/[0.07] text-muted-foreground'
                    )}>
                        {statusLabel}
                    </span>
                    {isSwitching ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-muted-foreground transition-colors group-hover:border-foreground/40 group-hover:text-foreground sm:flex">
                            <ChevronDown className="h-4 w-4" />
                        </span>
                    )}
                </span>
                {subline && <span className="mt-1 block truncate text-[13px] text-muted-foreground">{subline}</span>}
            </span>
            {/* En el móvil, el cambio se dice con palabras: es lo que no se veía. */}
            <span className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background sm:hidden">
                Cambiar
                <ChevronDown className="h-3.5 w-3.5" />
            </span>
        </button>
    ) : compactTrigger

    const trigger = variant === 'identity' ? identityTrigger : compactTrigger

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
                    <AthleteAvatar
                        initials={initials}
                        avatarUrl={client.avatar_url}
                        seed={inactive ? undefined : displayName}
                        className={isMobile ? 'h-10 w-10' : 'h-8 w-8'}
                        fallbackClassName={cn('text-xs font-bold', inactive ? 'bg-muted' : 'bg-primary/20')}
                    />
                    {!inactive && <UrgencyDot client={client} />}
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                            {displayName}
                            {client.is_sample && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-700 dark:text-amber-400">Ejemplo</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{client.is_sample ? 'Atleta de ejemplo' : client.email}</p>
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
                placeholder="Buscar atleta..."
                value={search}
                onValueChange={setSearch}
            />
            <CommandList className={cn(isMobile && 'max-h-[60vh]')}>
                <CommandEmpty>No hay ningún atleta con ese nombre.</CommandEmpty>
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
                        className="rounded-t-[28px] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-6"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                        <SheetHeader className="px-1 text-left">
                            <SheetTitle className="nt-display text-[1.6rem]">Cambiar de atleta</SheetTitle>
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
            <PopoverContent className="w-[340px] overflow-hidden rounded-2xl p-0" align="start">
                {list}
            </PopoverContent>
        </Popover>
    )
}
