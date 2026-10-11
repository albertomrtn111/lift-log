'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { FormTemplate, FormField, FormBuilderInitialData } from '@/types/forms'
import { Client } from '@/types/coach'
import type { MetricCategory, MetricDefinition } from '@/types/metrics'
import type { ReviewTemplate } from '@/data/review-templates'
import { FormBuilderModal } from './FormBuilderModal'
import { AIFormDialog } from './AIFormDialog'
import { ReviewTemplateDialog } from './ReviewTemplateDialog'
import {
    createFormTemplate,
    updateFormTemplate,
    duplicateFormTemplate,
    toggleFormTemplateActive,
    deleteFormTemplate,
} from '@/data/form-templates'
import {
    createGeneratedReviewAction,
    deleteReviewTemplateAction,
    duplicateReviewTemplateAction,
    toggleReviewTemplateActiveAction,
} from './review-template-actions'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'
import { CatalogEmpty, CatalogList, StatusPill } from '@/components/coach/CatalogList'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
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
import { useToast } from '@/hooks/use-toast'
import {
    Plus,
    MoreHorizontal,
    Pencil,
    Copy,
    Power,
    Trash2,
    FileText,
    ClipboardCheck,
    Camera,
    Image as ImageIcon,
} from 'lucide-react'

type FormTabType = 'onboarding'
type TabType = FormTabType | 'review-templates'
type BuilderTemplateType = 'onboarding' | 'checkin'

const TAB_CONFIG: { value: TabType; label: string }[] = [
    { value: 'review-templates', label: 'Revisiones' },
    { value: 'onboarding', label: 'Onboarding' },
]

interface FormsPageClientProps {
    templates: FormTemplate[]
    activeClients: Pick<Client, 'id' | 'full_name'>[]
    reviewTemplates: ReviewTemplate[]
    metrics: MetricDefinition[]
    metricCounts: Record<MetricCategory, number>
}

export function FormsPageClient({
    templates,
    activeClients,
    reviewTemplates,
    metrics,
    metricCounts,
}: FormsPageClientProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState<TabType>('review-templates')
    const [builderOpen, setBuilderOpen] = useState(false)
    const [builderTemplateType, setBuilderTemplateType] = useState<BuilderTemplateType>('onboarding')
    const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null)
    const [builderInitialData, setBuilderInitialData] = useState<FormBuilderInitialData | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<FormTemplate | null>(null)

    // Review templates state
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
    const [editingReviewTemplate, setEditingReviewTemplate] = useState<ReviewTemplate | null>(null)
    const [deleteReviewTarget, setDeleteReviewTarget] = useState<ReviewTemplate | null>(null)

    const isReviewTab = activeTab === 'review-templates'
    const checkinForms = templates.filter(t => t.type === 'checkin')

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const handleCreate = () => {
        if (isReviewTab) {
            setEditingReviewTemplate(null)
            setReviewDialogOpen(true)
            return
        }
        setBuilderTemplateType('onboarding')
        setEditingTemplate(null)
        setBuilderInitialData(null)
        setBuilderOpen(true)
    }

    const handleEdit = (template: FormTemplate) => {
        setBuilderTemplateType(template.type === 'checkin' ? 'checkin' : 'onboarding')
        setBuilderInitialData(null)
        setEditingTemplate(template)
        setBuilderOpen(true)
    }

    // ---- Review template handlers ----

    const handleEditReview = (rt: ReviewTemplate) => {
        setEditingReviewTemplate(rt)
        setReviewDialogOpen(true)
    }

    const handleToggleReviewActive = (rt: ReviewTemplate) => {
        startTransition(async () => {
            const result = await toggleReviewTemplateActiveAction(rt.id, !rt.is_active)
            if (result.success) {
                toast({ title: rt.is_active ? 'Plantilla desactivada' : 'Plantilla activada' })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const handleDeleteReview = (rt: ReviewTemplate) => {
        setDeleteReviewTarget(rt)
    }

    const handleDuplicateReview = (rt: ReviewTemplate) => {
        startTransition(async () => {
            const result = await duplicateReviewTemplateAction(rt.id)
            if (result.success) {
                toast({ title: 'Revisión duplicada' })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const confirmDeleteReview = () => {
        if (!deleteReviewTarget) return
        startTransition(async () => {
            const result = await deleteReviewTemplateAction(deleteReviewTarget.id)
            if (result.success) {
                toast({
                    title: result.deactivated ? 'Revisión desactivada' : 'Revisión eliminada',
                    description: result.deactivated
                        ? 'Tenía atletas asignados, así que se ha desactivado para evitar perder sus revisiones.'
                        : undefined,
                })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
            setDeleteReviewTarget(null)
        })
    }

    const handleGeneratedDraft = (type: 'onboarding' | 'checkin', data: FormBuilderInitialData) => {
        setBuilderTemplateType(type)
        setEditingTemplate(null)
        setBuilderInitialData(data)
        setActiveTab(type === 'onboarding' ? 'onboarding' : 'review-templates')
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
            if (builderTemplateType === 'checkin') {
                const result = await createGeneratedReviewAction({
                    title: data.title,
                    schema: data.schema,
                })
                if (result.success) {
                    toast({
                        title: 'Revisión creada',
                        description: 'Ya aparece en la lista. Puedes editarla para añadir métricas, fotos o cambiar la frecuencia.',
                    })
                    handleBuilderOpenChange(false)
                    router.refresh()
                } else {
                    toast({ title: 'Error', description: result.error, variant: 'destructive' })
                }
                return
            }

            const result = await createFormTemplate({
                title: data.title,
                type: builderTemplateType,
                schema: data.schema,
                assigned_client_ids: builderTemplateType === 'onboarding'
                    ? data.assigned_client_ids
                    : undefined,
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
                <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <ClientTabSwitcher
                        className="sm:max-w-sm"
                        value={activeTab}
                        onValueChange={setActiveTab}
                        options={TAB_CONFIG.map(tab => ({ value: tab.value, label: tab.label }))}
                    />
                    <div className="flex items-center gap-2">
                        <AIFormDialog
                            defaultType={isReviewTab ? 'checkin' : 'onboarding'}
                            allowedTypes={[isReviewTab ? 'checkin' : 'onboarding']}
                            onGenerated={handleGeneratedDraft}
                            trigger={
                                <AIActionButton className="max-sm:flex-1">
                                    Generar con IA
                                </AIActionButton>
                            }
                        />
                        <Button onClick={handleCreate} className="shrink-0 gap-1.5 max-sm:flex-1">
                            <Plus className="h-4 w-4" />
                            {isReviewTab ? 'Crear revisión' : 'Crear onboarding'}
                        </Button>
                    </div>
                </div>

                <TabsContent value="onboarding">
                    <TemplateTable
                        templates={templates.filter((t) => t.type === 'onboarding')}
                        isPending={isPending}
                        onEdit={handleEdit}
                        onDuplicate={handleDuplicate}
                        onToggleActive={handleToggleActive}
                        onDelete={handleDelete}
                    />
                </TabsContent>

                <TabsContent value="review-templates">
                    <ReviewTemplatesTable
                        reviewTemplates={reviewTemplates}
                        formTemplatesById={Object.fromEntries(templates.map(t => [t.id, t]))}
                        isPending={isPending}
                        onEdit={handleEditReview}
                        onDuplicate={handleDuplicateReview}
                        onToggleActive={handleToggleReviewActive}
                        onDelete={handleDeleteReview}
                    />
                </TabsContent>
            </Tabs>

            {/* Builder Modal */}
            <FormBuilderModal
                open={builderOpen}
                onOpenChange={handleBuilderOpenChange}
                templateType={builderTemplateType}
                editingTemplate={editingTemplate}
                initialData={builderInitialData}
                activeClients={activeClients}
                onSave={handleSave}
            />

            {/* Review Template Dialog */}
            <ReviewTemplateDialog
                open={reviewDialogOpen}
                onOpenChange={(v) => {
                    setReviewDialogOpen(v)
                    if (!v) setEditingReviewTemplate(null)
                }}
                editingTemplate={editingReviewTemplate}
                checkinForms={checkinForms}
                metrics={metrics}
                metricCounts={metricCounts}
            />

            {/* Delete Confirmation (form templates) */}
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

            {/* Delete Confirmation (review templates) */}
            <AlertDialog open={!!deleteReviewTarget} onOpenChange={(v) => !v && setDeleteReviewTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Desactivar revisión</AlertDialogTitle>
                        <AlertDialogDescription>
                            Si &quot;{deleteReviewTarget?.name}&quot; tiene atletas asignados, se desactivará
                            sin borrar sus revisiones programadas. Si no tiene asignaciones, se eliminará.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteReview}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Continuar
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
        return <CatalogEmpty icon={FileText} title="Aún no hay plantillas" description="Crea una para empezar." />
    }

    return (
        <CatalogList dimmed={isPending}>
            {templates.map((t) => {
                const assigned = t.assigned_client_ids?.length ?? 0
                const subtitle = t.type === 'onboarding'
                    ? (assigned > 0 ? `${assigned} atleta${assigned === 1 ? '' : 's'} asignado${assigned === 1 ? '' : 's'}` : 'Sin atletas asignados')
                    : 'Se asigna desde las revisiones'
                return (
                    <li key={t.id} className="flex items-center gap-2 pr-2 transition-colors hover:bg-muted/40">
                        <button type="button" onClick={() => onEdit(t)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <FileText className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold">{t.title}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {t.schema?.length ?? 0} campos · {subtitle}
                                </span>
                            </span>
                        </button>
                        <StatusPill active={t.is_active} activeLabel="Activo" inactiveLabel="Inactivo" />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Acciones de {t.title}</span>
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
                    </li>
                )
            })}
        </CatalogList>
    )
}

// ---------------------------------------------------------------------------
// Review Templates Table
// ---------------------------------------------------------------------------

function ReviewTemplatesTable({
    reviewTemplates,
    formTemplatesById,
    isPending,
    onEdit,
    onDuplicate,
    onToggleActive,
    onDelete,
}: {
    reviewTemplates: ReviewTemplate[]
    formTemplatesById: Record<string, FormTemplate>
    isPending: boolean
    onEdit: (rt: ReviewTemplate) => void
    onDuplicate: (rt: ReviewTemplate) => void
    onToggleActive: (rt: ReviewTemplate) => void
    onDelete: (rt: ReviewTemplate) => void
}) {
    if (reviewTemplates.length === 0) {
        return (
            <CatalogEmpty
                icon={ClipboardCheck}
                title="Aún no hay revisiones"
                description="Crea una revisión combinando formulario, métricas, fotos y frecuencia para asignarla a tus atletas."
            />
        )
    }

    const groupSummary = (rt: ReviewTemplate) => {
        const groups: string[] = []
        if (rt.include_body_metrics) groups.push('Cuerpo')
        if (rt.include_performance_metrics) groups.push('Rendimiento')
        if (rt.include_general_metrics) groups.push('General')
        return groups.length > 0 ? groups.join(', ') : null
    }

    return (
        <CatalogList dimmed={isPending}>
            {reviewTemplates.map((rt) => {
                const form = rt.form_template_id ? formTemplatesById[rt.form_template_id] : null
                const metricsLabel = groupSummary(rt)
                return (
                    <li key={rt.id} className="flex items-center gap-2 pr-2 transition-colors hover:bg-muted/40">
                        <button type="button" onClick={() => onEdit(rt)} className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left">
                            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <ClipboardCheck className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-semibold leading-snug">{rt.name}</span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    Cada {rt.default_frequency_days} días · {form?.title ?? 'Sin formulario'}
                                </span>
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                    {metricsLabel && (
                                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{metricsLabel}</Badge>
                                    )}
                                    <Badge variant="outline" className={cn(
                                        'gap-1 px-1.5 py-0 text-[10px]',
                                        rt.include_progress_photos ? 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'text-muted-foreground'
                                    )}>
                                        {rt.include_progress_photos ? <Camera className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                                        {rt.include_progress_photos ? (rt.photos_required ? 'Fotos obligatorias' : `Hasta ${rt.photos_max_items} fotos`) : 'Sin fotos'}
                                    </Badge>
                                </span>
                            </span>
                        </button>
                        <StatusPill active={rt.is_active} />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Acciones de {rt.name}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onEdit(rt)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDuplicate(rt)}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onToggleActive(rt)}>
                                    <Power className="mr-2 h-4 w-4" />
                                    {rt.is_active ? 'Desactivar' : 'Activar'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onDelete(rt)}
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
        </CatalogList>
    )
}
