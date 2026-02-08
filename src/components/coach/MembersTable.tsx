'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClientWithMeta } from '@/types/coach'
import { StatusFilter } from '@/data/members'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, UserX, UserCheck, Edit, ExternalLink, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { deactivateClientAction, reactivateClientAction } from './actions'
import { useState } from 'react'
import { EditClientModal } from './EditClientModal'

interface MembersTableProps {
    clients: ClientWithMeta[]
    statusFilter: StatusFilter
}

export function MembersTable({ clients, statusFilter }: MembersTableProps) {
    const router = useRouter()

    if (clients.length === 0) {
        const emptyMessage = statusFilter === 'active'
            ? 'No hay clientes activos'
            : statusFilter === 'inactive'
                ? 'No hay clientes inactivos'
                : 'No hay clientes registrados'

        return (
            <Card className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{emptyMessage}</h3>
                <p className="text-muted-foreground mb-4">
                    {statusFilter === 'inactive'
                        ? 'Todos tus clientes están activos.'
                        : 'Añade tu primer cliente para empezar.'}
                </p>
            </Card>
        )
    }

    return (
        <Card>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Próximo check-in</TableHead>
                        <TableHead className="hidden lg:table-cell">Frecuencia</TableHead>
                        <TableHead className="hidden lg:table-cell">Inicio</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {clients.map((client) => (
                        <ClientRow key={client.id} client={client} onUpdate={() => router.refresh()} />
                    ))}
                </TableBody>
            </Table>
        </Card>
    )
}

function ClientRow({ client, onUpdate }: { client: ClientWithMeta; onUpdate: () => void }) {
    const [isPending, startTransition] = useTransition()
    const [editModalOpen, setEditModalOpen] = useState(false)

    const handleDeactivate = () => {
        startTransition(async () => {
            await deactivateClientAction(client.id)
            onUpdate()
        })
    }

    const handleReactivate = () => {
        startTransition(async () => {
            await reactivateClientAction(client.id)
            onUpdate()
        })
    }

    const getCheckinBadge = () => {
        if (client.status !== 'active') return <span className="text-muted-foreground">—</span>

        if (client.daysUntilCheckin <= 0) {
            return <Badge variant="destructive">Hoy</Badge>
        } else if (client.daysUntilCheckin <= 2) {
            return <Badge className="bg-warning text-warning-foreground">{client.daysUntilCheckin}d</Badge>
        } else if (client.daysUntilCheckin <= 7) {
            return <Badge variant="secondary">{client.daysUntilCheckin}d</Badge>
        }
        return <span className="text-muted-foreground">{client.daysUntilCheckin}d</span>
    }

    return (
        <>
            <TableRow className={cn(isPending && 'opacity-50', client.status === 'inactive' && 'opacity-70')}>
                <TableCell>
                    <div>
                        <p className="font-medium">{client.full_name}</p>
                        <p className="text-sm text-muted-foreground">{client.email}</p>
                    </div>
                </TableCell>
                <TableCell>
                    <Badge
                        variant={client.status === 'active' ? 'default' : 'secondary'}
                        className={cn(
                            client.status === 'active' && 'bg-success/10 text-success border-0',
                            client.status === 'inactive' && 'bg-muted text-muted-foreground'
                        )}
                    >
                        {client.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                </TableCell>
                <TableCell>
                    {client.status === 'active' ? (
                        <div className="flex items-center gap-2">
                            <span className="text-sm">{client.next_checkin_date}</span>
                            {getCheckinBadge()}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                        {client.checkin_frequency_days} días
                    </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{client.start_date}</span>
                </TableCell>
                <TableCell>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isPending}>
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={`/coach/clients?client=${client.id}`}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Abrir workspace
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {client.status === 'active' ? (
                                <DropdownMenuItem
                                    onClick={handleDeactivate}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <UserX className="h-4 w-4 mr-2" />
                                    Dar de baja
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem
                                    onClick={handleReactivate}
                                    className="text-success focus:text-success"
                                >
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    Reactivar
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
            </TableRow>

            <EditClientModal
                client={client}
                open={editModalOpen}
                onOpenChange={setEditModalOpen}
                onSuccess={onUpdate}
            />
        </>
    )
}
