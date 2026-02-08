'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
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
import { History, ChevronDown, ChevronUp, Trash2, Loader2, Calendar, Settings2, Play, Copy } from 'lucide-react'
import { TrainingProgram } from '@/data/workspace'
import { deleteTrainingProgramClient } from '../clientActions'
import { activateTrainingProgramAction } from '../actions'
import { TrainingProgramWizard } from './TrainingProgramWizard'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'

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

    const archivedPrograms = programs.filter(p => p.status === 'archived')

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

    if (archivedPrograms.length === 0) return null

    return (
        <Card className="p-4">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-left"
            >
                <h3 className="font-medium flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Historial de programas archivados
                    <Badge variant="secondary" className="ml-2">
                        {archivedPrograms.length}
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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Semanas</TableHead>
                                <TableHead>Inicio</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {archivedPrograms.map(program => (
                                <TableRow key={program.id}>
                                    <TableCell className="font-medium">{program.name}</TableCell>
                                    <TableCell>{program.total_weeks} sem</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {program.effective_from || '---'}
                                    </TableCell>
                                    <TableCell className="text-right flex items-center justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setActivatingId(program.id)}
                                            className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10"
                                            title="Activar este programa"
                                            disabled={isActivating || isDeleting || isDuplicating}
                                        >
                                            <Play className="h-4 w-4 fill-current" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDuplicate(program.id)}
                                            className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10"
                                            title="Duplicar programa"
                                            disabled={isActivating || isDeleting || isDuplicating}
                                        >
                                            {duplicatingId === program.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setWizardConfig({ isOpen: true, programId: program.id, step: 3 })}
                                            className="h-8 w-8 p-0"
                                            title="Configurar"
                                            disabled={isActivating || isDeleting || isDuplicating}
                                        >
                                            <Settings2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDeletingId(program.id)}
                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            title="Eliminar permanentemente"
                                            disabled={isActivating || isDeleting || isDuplicating}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
