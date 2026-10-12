'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { History, ChevronDown, ChevronUp, Trash2, Loader2, Settings2, Play, Copy, Dumbbell, MoreHorizontal } from 'lucide-react'
import { TrainingProgram } from '@/data/workspace'
import { deleteTrainingProgramClient } from '../clientActions'
import { activateTrainingProgramAction } from '../actions'
import { TrainingProgramWizard } from './TrainingProgramWizard'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    active: { label: 'Activo', variant: 'default' },
    draft: { label: 'Borrador', variant: 'secondary' },
    completed: { label: 'Completado', variant: 'outline' },
    archived: { label: 'Archivado', variant: 'outline' },
}

interface TrainingProgramsHistoryProps {
    clientId: string
    programs: TrainingProgram[]
    onRefresh: () => void
}

export function TrainingProgramsHistory({
    clientId,
    programs,
    onRefresh
}: TrainingProgramsHistoryProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [activatingId, setActivatingId] = useState<string | null>(null)
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isActivating, setIsActivating] = useState(false)
    const [isDuplicating, setIsDuplicating] = useState(false)
    const [wizardConfig, setWizardConfig] = useState<{ isOpen: boolean, programId: string | null, step: number }>({
        isOpen: false,
        programId: null,
        step: 1
    })
    const queryClient = useQueryClient()
    const { toast } = useToast()

    // Show all non-active programs (archived, draft, completed)
    const historyPrograms = programs.filter(p => p.status !== 'active')

    const handleActivate = async () => {
        if (!activatingId) return

        setIsActivating(true)
        try {
            const result = await activateTrainingProgramAction(activatingId, clientId)
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] })
                queryClient.invalidateQueries({ queryKey: ["activeTrainingProgram", clientId] })
                toast({ title: 'Programa activado' })
                onRefresh()
                setActivatingId(null)
            } else {
                toast({
                    title: 'Error al activar',
                    description: result.error,
                    variant: 'destructive'
                })
            }
        } catch (error) {
            console.error('Error activating program:', error)
            toast({
                title: 'Error al activar',
                description: 'Ha ocurrido un error inesperado.',
                variant: 'destructive'
            })
        } finally {
            setIsActivating(false)
        }
    }

    const handleDuplicate = async (programId: string) => {
        setDuplicatingId(programId)
        setIsDuplicating(true)
        try {
            const { duplicateTrainingProgramClient } = await import('../clientActions')
            const result = await duplicateTrainingProgramClient(programId)
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] })
                toast({ title: 'Programa duplicado', description: 'Se ha creado una copia en el historial.' })
                onRefresh()
            } else {
                toast({
                    title: 'Error al duplicar',
                    description: result.error,
                    variant: 'destructive'
                })
            }
        } catch (error) {
            console.error('Error duplicating program:', error)
            toast({
                title: 'Error al duplicar',
                description: 'Error inesperado.',
                variant: 'destructive'
            })
        } finally {
            setIsDuplicating(false)
            setDuplicatingId(null)
        }
    }

    const handleDelete = async () => {
        if (!deletingId) return

        setIsDeleting(true)
        try {
            const result = await deleteTrainingProgramClient(deletingId)
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] })
                toast({
                    title: 'Eliminado',
                })
                onRefresh()
                setDeletingId(null)
            } else {
                toast({
                    title: 'Error al eliminar',
                    description: result.error,
                    variant: 'destructive'
                })
            }
        } catch (error) {
            console.error('Error deleting program:', error)
            toast({
                title: 'Error al eliminar',
                description: 'Ha ocurrido un error inesperado.',
                variant: 'destructive'
            })
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Card className="rounded-2xl border-border/70 p-4">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-left"
                aria-expanded={isExpanded}
            >
                <h3 className="font-medium flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Historial de programas
                    <Badge variant="secondary" className="ml-2">
                        {historyPrograms.length}
                    </Badge>
                </h3>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
            </button>

            {isExpanded && (
                <div className="mt-4">
                    {historyPrograms.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Dumbbell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No hay programas anteriores</p>
                            <p className="text-xs mt-1">Cuando archives o crees nuevos programas aparecerán aquí</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                            {historyPrograms.map(program => {
                                const statusCfg = STATUS_CONFIG[program.status] || STATUS_CONFIG.archived
                                const busy = isActivating || isDeleting || isDuplicating
                                const startLabel = program.effective_from
                                    ? new Date(`${program.effective_from}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : null
                                return (
                                    <li key={program.id} className="flex items-center gap-2 py-2.5 pl-3.5 pr-1.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-2 text-sm font-semibold leading-snug">{program.name}</p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                                <Badge variant={statusCfg.variant} className="px-1.5 py-0 text-[10px]">{statusCfg.label}</Badge>
                                                <span>{program.total_weeks} sem</span>
                                                {startLabel && <span>· desde el {startLabel}</span>}
                                            </p>
                                        </div>
                                        {duplicatingId === program.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={busy} aria-label={`Acciones de ${program.name}`}>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setActivatingId(program.id)}>
                                                    <Play className="mr-2 h-4 w-4" />
                                                    Activar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setWizardConfig({ isOpen: true, programId: program.id, step: 3 })}>
                                                    <Settings2 className="mr-2 h-4 w-4" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDuplicate(program.id)}>
                                                    <Copy className="mr-2 h-4 w-4" />
                                                    Duplicar
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => setDeletingId(program.id)}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Eliminar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            )}

            <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar programa?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el programa, sus días, columnas y todos los datos asociados de forma permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Eliminando...
                                </>
                            ) : (
                                'Eliminar'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!activatingId} onOpenChange={(open) => !open && setActivatingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Activar programa antiguo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esto archivará el programa activo actual y restaurará este programa como el activo para el cliente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActivating}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleActivate}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={isActivating}
                        >
                            {isActivating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Activando...
                                </>
                            ) : (
                                'Activar'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {wizardConfig.programId && (
                <TrainingProgramWizard
                    programId={wizardConfig.programId}
                    isOpen={wizardConfig.isOpen}
                    initialStep={wizardConfig.step}
                    onOpenChange={(open) => setWizardConfig(prev => ({ ...prev, isOpen: open }))}
                    onClose={() => {
                        setWizardConfig({ isOpen: false, programId: null, step: 1 })
                        onRefresh()
                    }}
                />
            )}
        </Card>
    )
}
