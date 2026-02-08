'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TrainingTemplate } from '@/types/templates'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MoreHorizontal, Edit, Trash2, FileText, Loader2, AlertCircle, Dumbbell, Heart } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { deleteTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { cn } from '@/lib/utils'

interface TemplatesTableProps {
    templates: TrainingTemplate[]
}

export function TemplatesTable({ templates }: TemplatesTableProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [templateToDelete, setTemplateToDelete] = useState<TrainingTemplate | null>(null)
    const [isDeleting, startDeleteTransition] = useTransition()

    const handleDelete = () => {
        if (!templateToDelete) return

        startDeleteTransition(async () => {
            const result = await deleteTemplate(templateToDelete.id)

            if (result.success) {
                toast({
                    title: 'Plantilla eliminada',
                    description: 'La plantilla ha sido eliminada correctamente.',
                })
                router.refresh()
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'No se pudo eliminar la plantilla.',
                    variant: 'destructive',
                })
            }
            setTemplateToDelete(null)
        })
    }

    if (templates.length === 0) {
        return (
            <Card className="p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No tienes plantillas</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                    Crea tu primera plantilla para empezar a organizar tus entrenamientos y reutilizarlos con múltiples clientes.
                </p>
                {/* Create button logic is in page header, but we could add one here too if needed */}
            </Card>
        )
    }

    return (
        <>
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[300px]">Nombre</TableHead>
                            <TableHead>Etiquetas</TableHead>
                            <TableHead className="hidden md:table-cell">Descripción</TableHead>
                            <TableHead className="w-[100px] text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {templates.map((template) => (
                            <TemplateRow
                                key={template.id}
                                template={template}
                                onDeleteClick={() => setTemplateToDelete(template)}
                            />
                        ))}
                    </TableBody>
                </Table>
            </Card>

            <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente la plantilla "{templateToDelete?.name}".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                handleDelete()
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

function TemplateRow({
    template,
    onDeleteClick,
}: {
    template: TrainingTemplate
    onDeleteClick: () => void
}) {
    return (
        <TableRow>
            <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center bg-muted",
                        template.type === 'cardio' ? "text-red-500 bg-red-500/10" : "text-blue-500 bg-blue-500/10"
                    )}>
                        {template.type === 'cardio' ? <Heart className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
                    </div>
                    <div className="flex flex-col">
                        <span>{template.name}</span>
                        <span className="text-xs text-muted-foreground md:hidden truncate max-w-[200px]">
                            {template.description}
                        </span>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap gap-1">
                    {template.tags && template.tags.length > 0 ? (
                        template.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))
                    ) : (
                        <span className="text-muted-foreground text-sm italic">Sin etiquetas</span>
                    )}
                    {template.tags && template.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                            +{template.tags.length - 3}
                        </Badge>
                    )}
                </div>
            </TableCell>
            <TableCell className="hidden md:table-cell text-muted-foreground max-w-[300px]">
                <p className="truncate" title={template.description || ''}>
                    {template.description || '—'}
                </p>
            </TableCell>
            <TableCell className="text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Abrir menú</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                            <Link href={`/coach/templates/${template.id}`} className="cursor-pointer">
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive cursor-pointer"
                            onClick={onDeleteClick}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    )
}
