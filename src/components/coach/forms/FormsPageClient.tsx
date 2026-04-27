'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FormTemplate, FormField, FormBuilderInitialData } from '@/types/forms'
import { Client } from '@/types/coach'
import { FormBuilderModal } from './FormBuilderModal'
import { AIFormDialog } from './AIFormDialog'
import {
    createFormTemplate,
    updateFormTemplate,
    duplicateFormTemplate,
    toggleFormTemplateActive,
    deleteFormTemplate,
} from '@/data/form-templates'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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
import { useToast } from '@/hooks/use-toast'
import {
    Plus,
    MoreHorizontal,
    Pencil,
    Copy,
    Power,
    Trash2,
    FileText,
    Sparkles,
} from 'lucide-react'

type TabType = 'onboarding' | 'checkin' | 'general'

const TAB_CONFIG: { value: TabType; label: string }[] = [
    { value: 'onboarding', label: 'Onboarding' },
    { value: 'checkin', label: 'Revisión' },
    { value: 'general', label: 'General' },
]

interface FormsPageClientProps {
    templates: FormTemplate[]
    activeClients: Pick<Client, 'id' | 'full_name'>[]
}

export function FormsPageClient({ templates, activeClients }: FormsPageClientProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState<TabType>('onboarding')
    const [builderOpen, setBuilderOpen] = useState(false)
    const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null)
    const [builderInitialData, setBuilderInitialData] = useState<FormBuilderInitialData | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<FormTemplate | null>(null)

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const handleCreate = () => {
        setEditingTemplate(null)
        setBuilderInitialData(null)
        setBuilderOpen(true)
    }

    const handleEdit = (template: FormTemplate) => {
        setBuilderInitialData(null)
        setEditingTemplate(template)
        setBuilderOpen(true)
    }

    const handleGeneratedDraft = (
        type: Extract<TabType, 'onboarding' | 'checkin'>,
        data: FormBuilderInitialData
    ) => {
        setEditingTemplate(null)
        setBuilderInitialData(data)
        setActiveTab(type)
        setBuilderOpen(true)
    }

    const handleBuilderOpenChange = (open: boolean) => {
        setBuilderOpen(open)
        if (!open) {
            setEditingTemplate(null)
            setBuilderInitialData(null)
        }
    }

    const handleSave = async (data: { title: string; schema: FormField[]; assigned_client_ids?: string[] }) => {
        if (editingTemplate) {
            const result = await updateFormTemplate(editingTemplate.id, {
                title: data.title,
                schema: data.schema,
                assigned_client_ids: data.assigned_client_ids,
            })
            if (result.success) {
                toast({ title: 'Plantilla actualizada' })
                handleBuilderOpenChange(false)
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        } else {
            const result = await createFormTemplate({
                title: data.title,
                type: activeTab,
                schema: data.schema,
                assigned_client_ids: data.assigned_client_ids,
            })
            if (result.success) {
                toast({ title: 'Plantilla creada' })
                handleBuilderOpenChange(false)
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        }
    }

    const handleDuplicate = (template: FormTemplate) => {
        startTransition(async () => {
            const result = await duplicateFormTemplate(template.id)
            if (result.success) {
                toast({ title: 'Plantilla duplicada' })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const handleToggleActive = (template: FormTemplate) => {
        startTransition(async () => {
            const result = await toggleFormTemplateActive(template.id)
            if (result.success) {
                toast({
                    title: template.is_active ? 'Plantilla desactivada' : 'Plantilla activada',
                })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const handleDelete = (template: FormTemplate) => {
        setDeleteTarget(template)
    }

    const confirmDelete = () => {
        if (!deleteTarget) return
        startTransition(async () => {
            const result = await deleteFormTemplate(deleteTarget.id)
            if (result.success) {
                toast({ title: 'Plantilla eliminada' })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
            setDeleteTarget(null)
        })
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
                <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                    <TabsList>
                        {TAB_CONFIG.map((tab) => {
                            const count = templates.filter((t) => t.type === tab.value).length
                            return (
                                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                                    {tab.label}
                                    {count > 0 && (
                                        <Badge
                                            variant="secondary"
                                            className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
                                        >
                                            {count}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                    <div className="flex items-center gap-2">
                        <AIFormDialog
                            defaultType={activeTab === 'general' ? 'onboarding' : activeTab}
                            onGenerated={handleGeneratedDraft}
                            trigger={
                                <AIActionButton>
                                    Generar con IA
                                </AIActionButton>
                            }
                        />
                        <Button onClick={handleCreate} className="gap-1.5 shrink-0">
                            <Plus className="h-4 w-4" />
                            Crear Plantilla
                        </Button>
                    </div>
                </div>

                {TAB_CONFIG.map((tab) => (
                    <TabsContent key={tab.value} value={tab.value}>
                        <TemplateTable
                            templates={templates.filter((t) => t.type === tab.value)}
                            isPending={isPending}
                            onEdit={handleEdit}
                            onDuplicate={handleDuplicate}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
                        />
                    </TabsContent>
                ))}
            </Tabs>

            {/* Builder Modal */}
            <FormBuilderModal
                open={builderOpen}
                onOpenChange={handleBuilderOpenChange}
                templateType={activeTab}
                editingTemplate={editingTemplate}
                initialData={builderInitialData}
                activeClients={activeClients}
                onSave={handleSave}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar Plantilla</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Estás seguro de que quieres eliminar &quot;{deleteTarget?.title}&quot;? Esta
                            acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ---------------------------------------------------------------------------
// Template Table
// ---------------------------------------------------------------------------

function TemplateTable({
    templates,
    isPending,
    onEdit,
    onDuplicate,
    onToggleActive,
    onDelete,
}: {
    templates: FormTemplate[]
    isPending: boolean
    onEdit: (t: FormTemplate) => void
    onDuplicate: (t: FormTemplate) => void
    onToggleActive: (t: FormTemplate) => void
    onDelete: (t: FormTemplate) => void
}) {
    if (templates.length === 0) {
        return (
            <Card className="p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold">Aún no hay plantillas</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Crea una para empezar.
                </p>
            </Card>
        )
    }

    return (
        <Card>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Campos</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="hidden sm:table-cell">Creado</TableHead>
                        <TableHead className="w-12" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {templates.map((t) => (
                        <TableRow
                            key={t.id}
                            className={isPending ? 'opacity-60 pointer-events-none' : ''}
                        >
                            <TableCell>
                                <div>
                                    <span className="font-medium">{t.title}</span>
                                    {(t.type === 'checkin' || t.type === 'onboarding') && (
                                        <p className="text-xs text-muted-foreground">
                                            {(t.assigned_client_ids?.length ?? 0) > 0
                                                ? `${t.assigned_client_ids.length} atleta${t.assigned_client_ids.length === 1 ? '' : 's'} asignado${t.assigned_client_ids.length === 1 ? '' : 's'}`
                                                : 'Sin atletas asignados'}
                                        </p>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <span className="text-muted-foreground text-sm">
                                    {t.schema?.length ?? 0} campos
                                </span>
                            </TableCell>
                            <TableCell>
                                {t.is_active ? (
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                                        Activo
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20">
                                        Inactivo
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                                {new Date(t.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onEdit(t)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onDuplicate(t)}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Duplicar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onToggleActive(t)}>
                                            <Power className="mr-2 h-4 w-4" />
                                            {t.is_active ? 'Desactivar' : 'Activar'}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => onDelete(t)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Eliminar
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    )
}
