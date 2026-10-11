'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TrainingTemplate } from '@/types/templates'
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
import { MoreHorizontal, Edit, Trash2, FileText, Loader2, Dumbbell, Heart } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { deleteTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { cn } from '@/lib/utils'
import { CardioTemplateDialog } from './CardioTemplateDialog'

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
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold">No tienes plantillas</h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Crea tu primera plantilla para reutilizar entrenamientos con varios atletas.
                </p>
            </div>
        )
    }

    return (
        <>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                {templates.map((template) => (
                    <TemplateRow
                        key={template.id}
                        template={template}
                        onDeleteClick={() => setTemplateToDelete(template)}
                    />
                ))}
            </ul>

            <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente la plantilla &quot;{templateToDelete?.name}&quot;.
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
    const isCardio = template.type === 'cardio'
    const tags = template.tags ?? []

    const body = (
        <>
            <span className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                isCardio ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'
            )}>
                {isCardio ? <Heart className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-foreground">{template.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{template.description || 'Sin descripción'}</span>
                {tags.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                        {tags.slice(0, 3).map((tag, index) => (
                            <Badge key={index} variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{tag}</Badge>
                        ))}
                        {tags.length > 3 && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">+{tags.length - 3}</Badge>
                        )}
                    </span>
                )}
            </span>
        </>
    )

    return (
        <li className="flex items-center gap-2 pr-2 transition-colors hover:bg-muted/40">
            {isCardio ? (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4">{body}</div>
            ) : (
                <Link href={`/coach/templates/${template.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 no-underline">
                    {body}
                </Link>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Abrir menú</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {isCardio ? (
                        <CardioTemplateDialog
                            template={template}
                            trigger={
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                </DropdownMenuItem>
                            }
                        />
                    ) : (
                        <DropdownMenuItem asChild>
                            <Link href={`/coach/templates/${template.id}`} className="cursor-pointer">
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                            </Link>
                        </DropdownMenuItem>
                    )}
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
        </li>
    )
}
