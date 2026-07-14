'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Camera, Activity, Dumbbell, Layers, Sliders, FileText, Plus, Pencil } from 'lucide-react'
import type { FormField, FormTemplate } from '@/types/forms'
import type { MetricCategory, MetricDefinition } from '@/types/metrics'
import type { ReviewTemplate, ReviewType } from '@/data/review-templates'
import {
    createReviewTemplateAction,
    updateReviewTemplateAction,
    listReviewTemplateMetricsAction,
} from './review-template-actions'
import { createFormTemplate, updateFormTemplate } from '@/data/form-templates'
import { FormBuilderModal } from './FormBuilderModal'

const REVIEW_TYPE_OPTIONS: { value: ReviewType; label: string }[] = [
    { value: 'weekly', label: 'Semanal' },
    { value: 'biweekly', label: 'Quincenal' },
    { value: 'monthly', label: 'Mensual' },
    { value: 'manual', label: 'Manual' },
    { value: 'custom', label: 'Personalizada' },
]

const CATEGORY_META: Record<MetricCategory, { label: string; icon: React.ReactNode; description: string }> = {
    body: { label: 'Métricas corporales', icon: <Layers className="h-4 w-4 text-rose-500" />, description: 'Pecho, brazos, cintura, cadera…' },
    performance: { label: 'Métricas de rendimiento', icon: <Activity className="h-4 w-4 text-blue-500" />, description: 'VFC, FC, escala de recuperación…' },
    general: { label: 'Métricas generales', icon: <Dumbbell className="h-4 w-4 text-emerald-500" />, description: 'Otras métricas personalizadas' },
}

interface ReviewTemplateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    editingTemplate?: ReviewTemplate | null
    checkinForms: FormTemplate[]
    metrics: MetricDefinition[]
    metricCounts: Record<MetricCategory, number>
}

export function ReviewTemplateDialog({
    open,
    onOpenChange,
    editingTemplate,
    checkinForms,
    metrics,
    metricCounts,
}: ReviewTemplateDialogProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [reviewType, setReviewType] = useState<ReviewType>('custom')
    const [formTemplateId, setFormTemplateId] = useState<string>('')
    const [defaultFrequencyDays, setDefaultFrequencyDays] = useState<number>(14)
    const [includeBody, setIncludeBody] = useState(false)
    const [includePerformance, setIncludePerformance] = useState(false)
    const [includeGeneral, setIncludeGeneral] = useState(false)
    const [includePhotos, setIncludePhotos] = useState(false)
    const [photosRequired, setPhotosRequired] = useState(false)
    const [photosMaxItems, setPhotosMaxItems] = useState<number>(6)
    const [isActive, setIsActive] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeSection, setActiveSection] = useState<'form' | 'settings'>('form')

    // Nivel 2: selección avanzada por métrica
    const [advancedMode, setAdvancedMode] = useState(false)
    const [selectedMetricIds, setSelectedMetricIds] = useState<Set<string>>(new Set())
    const [loadingMetrics, setLoadingMetrics] = useState(false)

    // Editor de preguntas (crear/editar formularios de check-in sin salir del diálogo)
    const [formBuilderOpen, setFormBuilderOpen] = useState(false)
    const [formBuilderEditing, setFormBuilderEditing] = useState<FormTemplate | null>(null)
    // Formularios creados/editados en esta sesión del diálogo, antes de que llegue el refresh del servidor
    const [formOverrides, setFormOverrides] = useState<Record<string, FormTemplate>>({})

    const effectiveForms = useMemo(() => {
        const base = checkinForms.map(f => formOverrides[f.id] ?? f)
        const knownIds = new Set(base.map(f => f.id))
        const created = Object.values(formOverrides).filter(f => !knownIds.has(f.id))
        return [...base, ...created]
    }, [checkinForms, formOverrides])

    // Reset al abrir / cambiar editingTemplate
    useEffect(() => {
        if (!open) return

        let cancelled = false
        async function init() {
            setActiveSection('form')
            if (editingTemplate) {
                setName(editingTemplate.name)
                setDescription(editingTemplate.description ?? '')
                setReviewType(editingTemplate.review_type)
                setFormTemplateId(editingTemplate.form_template_id ?? '')
                setDefaultFrequencyDays(editingTemplate.default_frequency_days)
                // Coerción: un grupo marcado pero sin métricas activas en el catálogo
                // se desmarca (su switch se muestra apagado y deshabilitado, así que
                // el coach no podría corregirlo a mano)
                setIncludeBody(editingTemplate.include_body_metrics && metricCounts.body > 0)
                setIncludePerformance(editingTemplate.include_performance_metrics && metricCounts.performance > 0)
                setIncludeGeneral(editingTemplate.include_general_metrics && metricCounts.general > 0)
                setIncludePhotos(editingTemplate.include_progress_photos)
                setPhotosRequired(editingTemplate.photos_required)
                setPhotosMaxItems(editingTemplate.photos_max_items)
                setIsActive(editingTemplate.is_active)

                // Cargar selección avanzada (Nivel 2) si existe
                setLoadingMetrics(true)
                try {
                    const ids = await listReviewTemplateMetricsAction(editingTemplate.id)
                    if (cancelled) return
                    if (ids.length > 0) {
                        setAdvancedMode(true)
                        setSelectedMetricIds(new Set(ids))
                    } else {
                        setAdvancedMode(false)
                        setSelectedMetricIds(new Set())
                    }
                } finally {
                    if (!cancelled) setLoadingMetrics(false)
                }
            } else {
                setName('')
                setDescription('')
                setReviewType('custom')
                setFormTemplateId('')
                setDefaultFrequencyDays(14)
                setIncludeBody(false)
                setIncludePerformance(false)
                setIncludeGeneral(false)
                setIncludePhotos(false)
                setPhotosRequired(false)
                setPhotosMaxItems(6)
                setIsActive(true)
                setAdvancedMode(false)
                setSelectedMetricIds(new Set())
            }
            setError(null)
            setFormOverrides({})
            setFormBuilderEditing(null)
        }
        init()
        return () => { cancelled = true }
    }, [open, editingTemplate])

    const handleFormBuilderSave = async (data: { title: string; schema: FormField[] }) => {
        if (formBuilderEditing) {
            const result = await updateFormTemplate(formBuilderEditing.id, {
                title: data.title,
                schema: data.schema,
            })
            if (result.success) {
                setFormOverrides(prev => ({
                    ...prev,
                    [formBuilderEditing.id]: { ...formBuilderEditing, title: data.title, schema: data.schema },
                }))
                toast({ title: 'Formulario actualizado' })
                setFormBuilderOpen(false)
                setFormBuilderEditing(null)
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        } else {
            const result = await createFormTemplate({
                title: data.title,
                type: 'checkin',
                schema: data.schema,
            })
            if (result.success && result.template) {
                const created = result.template
                setFormOverrides(prev => ({ ...prev, [created.id]: created }))
                setFormTemplateId(created.id)
                toast({ title: 'Formulario creado', description: 'Ya está seleccionado en esta revisión.' })
                setFormBuilderOpen(false)
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        }
    }

    const toggleMetric = (id: string) => {
        setSelectedMetricIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAdvancedMode = (val: boolean) => {
        setAdvancedMode(val)
        if (val) {
            // Al activar modo avanzado, preseleccionar los del grupo activo (UX intuitivo)
            const preselected = new Set<string>()
            for (const m of metrics) {
                const cat = m.category as MetricCategory
                if (cat === 'body' && includeBody) preselected.add(m.id)
                if (cat === 'performance' && includePerformance) preselected.add(m.id)
                if (cat === 'general' && includeGeneral) preselected.add(m.id)
            }
            // Solo preseleccionar si no había selección previa
            if (selectedMetricIds.size === 0) setSelectedMetricIds(preselected)
        }
    }

    const handleSave = () => {
        setError(null)
        const fail = (message: string) => {
            setActiveSection('settings')
            setError(message)
        }
        if (!name.trim()) {
            fail('El nombre es obligatorio')
            return
        }
        if (defaultFrequencyDays < 1 || defaultFrequencyDays > 365) {
            fail('La frecuencia debe estar entre 1 y 365 días')
            return
        }

        // Validación según modo
        let hasAnyMetric = false
        let finalIncludeBody = includeBody
        let finalIncludePerformance = includePerformance
        let finalIncludeGeneral = includeGeneral
        let metricIdsPayload: string[] = []

        if (advancedMode) {
            const selected = Array.from(selectedMetricIds)
            metricIdsPayload = selected
            hasAnyMetric = selected.length > 0
            // Recalcular flags de grupo según las métricas seleccionadas
            finalIncludeBody = metrics.some(m => selectedMetricIds.has(m.id) && m.category === 'body')
            finalIncludePerformance = metrics.some(m => selectedMetricIds.has(m.id) && m.category === 'performance')
            finalIncludeGeneral = metrics.some(m => selectedMetricIds.has(m.id) && m.category === 'general')
        } else {
            // Coerción en vez de bloqueo: un grupo marcado sin métricas activas
            // en el catálogo no aporta nada, se guarda desmarcado.
            finalIncludeBody = includeBody && metricCounts.body > 0
            finalIncludePerformance = includePerformance && metricCounts.performance > 0
            finalIncludeGeneral = includeGeneral && metricCounts.general > 0
            hasAnyMetric = finalIncludeBody || finalIncludePerformance || finalIncludeGeneral
            metricIdsPayload = [] // Limpia cualquier selección Nivel 2 anterior
        }

        const hasForm = !!formTemplateId
        const hasPhotos = includePhotos
        if (!hasForm && !hasAnyMetric && !hasPhotos) {
            fail('La revisión está vacía. Selecciona al menos un formulario, métricas o activa las fotos.')
            return
        }

        const payload = {
            name: name.trim(),
            description: description.trim() || null,
            review_type: reviewType,
            form_template_id: formTemplateId || null,
            default_frequency_days: defaultFrequencyDays,
            include_body_metrics: finalIncludeBody,
            include_performance_metrics: finalIncludePerformance,
            include_general_metrics: finalIncludeGeneral,
            include_progress_photos: includePhotos,
            photos_required: includePhotos ? photosRequired : false,
            photos_max_items: photosMaxItems,
            is_active: isActive,
        }

        startTransition(async () => {
            const result = editingTemplate
                ? await updateReviewTemplateAction(editingTemplate.id, payload, metricIdsPayload)
                : await createReviewTemplateAction(payload, metricIdsPayload)

            if (result.success) {
                toast({ title: editingTemplate ? 'Revisión actualizada' : 'Revisión creada' })
                onOpenChange(false)
                router.refresh()
            } else {
                fail(result.error ?? 'Error inesperado')
            }
        })
    }

    const selectedForm = effectiveForms.find((form) => form.id === formTemplateId) ?? null
    const selectedFormFields = (selectedForm?.schema ?? []).filter(
        (field) => field.id !== 'progress_photos'
    )
    const metricsByCategory: Record<MetricCategory, MetricDefinition[]> = { body: [], performance: [], general: [] }
    for (const m of metrics) {
        const cat = m.category as MetricCategory
        if (cat in metricsByCategory) metricsByCategory[cat].push(m)
    }

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
                    <DialogTitle>
                        {editingTemplate ? 'Editar revisión' : 'Nueva revisión'}
                    </DialogTitle>
                    <DialogDescription>
                        Define qué se le pide al atleta cuando llegue esta revisión: formulario, métricas y fotos.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as 'form' | 'settings')}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="form">Formulario</TabsTrigger>
                            <TabsTrigger value="settings">Configuración</TabsTrigger>
                        </TabsList>

                        <TabsContent value="form" className="mt-5 space-y-4">
                            <Card className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <FileText className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-3">
                                        <div>
                                            <h4 className="text-sm font-semibold">Preguntas de esta revisión</h4>
                                            <p className="text-xs text-muted-foreground">
                                                Elige aquí el formulario que verá el atleta en esta revisión.
                                            </p>
                                        </div>

                                        <div>
                                            <Label htmlFor="rt-form" className="text-xs">
                                                Formulario asociado <span className="text-muted-foreground">(opcional)</span>
                                            </Label>
                                            <Select
                                                value={formTemplateId || 'none'}
                                                onValueChange={(v) => setFormTemplateId(v === 'none' ? '' : v)}
                                            >
                                                <SelectTrigger id="rt-form" className="mt-1.5">
                                                    <SelectValue placeholder="Sin formulario (solo métricas/fotos)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Sin formulario</SelectItem>
                                                    {effectiveForms.map(f => (
                                                        <SelectItem key={f.id} value={f.id}>
                                                            {f.title}{!f.is_active && ' (inactivo)'}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {selectedForm && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1.5"
                                                    onClick={() => {
                                                        setFormBuilderEditing(selectedForm)
                                                        setFormBuilderOpen(true)
                                                    }}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    Editar preguntas
                                                </Button>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={() => {
                                                    setFormBuilderEditing(null)
                                                    setFormBuilderOpen(true)
                                                }}
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Crear formulario nuevo
                                            </Button>
                                        </div>

                                        {selectedForm ? (
                                            <div className="rounded-lg border bg-muted/20 overflow-hidden">
                                                <div className="flex items-start justify-between gap-3 p-3 border-b">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium">{selectedForm.title}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {selectedFormFields.length} pregunta{selectedFormFields.length === 1 ? '' : 's'}
                                                        </p>
                                                    </div>
                                                    <Badge variant={selectedForm.is_active ? 'outline' : 'secondary'}>
                                                        {selectedForm.is_active ? 'Activo' : 'Inactivo'}
                                                    </Badge>
                                                </div>
                                                {selectedFormFields.length > 0 ? (
                                                    <div className="divide-y max-h-64 overflow-y-auto">
                                                        {selectedFormFields.map((field, i) => (
                                                            <div key={field.id} className="flex items-center gap-2 px-3 py-2">
                                                                <span className="w-5 shrink-0 text-[10px] font-mono text-muted-foreground">{i + 1}.</span>
                                                                <span className="min-w-0 flex-1 truncate text-sm">
                                                                    {field.label}
                                                                    {field.required && <span className="ml-0.5 text-destructive">*</span>}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="p-3 text-xs text-muted-foreground">
                                                        Este formulario no tiene preguntas todavía. Pulsa &quot;Editar preguntas&quot; para añadirlas.
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
                                                Esta revisión no tiene formulario. Puede funcionar solo con métricas o fotos.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </TabsContent>

                        <TabsContent value="settings" className="mt-5 space-y-5">
                            {/* Datos básicos */}
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="rt-name" className="text-xs">Nombre <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="rt-name"
                                        placeholder="Ej. Check-in semanal runner"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="mt-1.5"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="rt-desc" className="text-xs">Descripción <span className="text-muted-foreground">(opcional)</span></Label>
                                    <Textarea
                                        id="rt-desc"
                                        placeholder="Cuándo se usa esta plantilla, qué tipo de atleta…"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="mt-1.5 min-h-[60px] resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label htmlFor="rt-type" className="text-xs">Tipo</Label>
                                        <Select value={reviewType} onValueChange={(v) => setReviewType(v as ReviewType)}>
                                            <SelectTrigger id="rt-type" className="mt-1.5">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {REVIEW_TYPE_OPTIONS.map(o => (
                                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="rt-freq" className="text-xs">Frecuencia recomendada (días)</Label>
                                        <Input
                                            id="rt-freq"
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={defaultFrequencyDays}
                                            onChange={(e) => setDefaultFrequencyDays(parseInt(e.target.value) || 14)}
                                            className="mt-1.5"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-muted/20 p-3">
                                    <p className="text-xs font-medium">Formulario</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {selectedForm
                                            ? selectedForm.title
                                            : 'Sin formulario asociado: esta revisión solo pedirá métricas o fotos.'}
                                    </p>
                                </div>
                            </div>

                            {/* Métricas */}
                            <div className="space-y-2 border-t pt-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold">Métricas a incluir</h4>
                                        <p className="text-xs text-muted-foreground">
                                            {advancedMode
                                                ? 'Selecciona métricas concretas (anula la selección por grupos).'
                                                : 'Por grupo: pide todas las métricas activas de cada categoría.'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                                        <Label htmlFor="rt-advanced" className="text-xs cursor-pointer">Selección avanzada</Label>
                                        <Switch
                                            id="rt-advanced"
                                            checked={advancedMode}
                                            onCheckedChange={toggleAdvancedMode}
                                            disabled={loadingMetrics}
                                        />
                                    </div>
                                </div>

                                {loadingMetrics ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    </div>
                                ) : advancedMode ? (
                                    <div className="space-y-3">
                                        {(['body', 'performance', 'general'] as MetricCategory[]).map(cat => {
                                            const meta = CATEGORY_META[cat]
                                            const list = metricsByCategory[cat]
                                            if (list.length === 0) return null
                                            const selectedInCat = list.filter(m => selectedMetricIds.has(m.id)).length
                                            const allSelected = selectedInCat === list.length

                                            const toggleAll = () => {
                                                setSelectedMetricIds(prev => {
                                                    const next = new Set(prev)
                                                    if (allSelected) {
                                                        list.forEach(m => next.delete(m.id))
                                                    } else {
                                                        list.forEach(m => next.add(m.id))
                                                    }
                                                    return next
                                                })
                                            }

                                            return (
                                                <div key={cat} className="rounded-lg border overflow-hidden">
                                                    <div className="flex items-center justify-between bg-muted/30 px-3 py-2 border-b">
                                                        <div className="flex items-center gap-2">
                                                            {meta.icon}
                                                            <span className="text-sm font-medium">{meta.label}</span>
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                {selectedInCat}/{list.length}
                                                            </Badge>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={toggleAll}
                                                            className="text-xs text-primary hover:underline"
                                                        >
                                                            {allSelected ? 'Desmarcar todas' : 'Marcar todas'}
                                                        </button>
                                                    </div>
                                                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {list.map(m => (
                                                            <label
                                                                key={m.id}
                                                                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-2 py-1.5"
                                                            >
                                                                <Checkbox
                                                                    checked={selectedMetricIds.has(m.id)}
                                                                    onCheckedChange={() => toggleMetric(m.id)}
                                                                />
                                                                <span className="flex-1 truncate">{m.name}</span>
                                                                {m.unit && (
                                                                    <span className="text-[10px] text-muted-foreground">{m.unit}</span>
                                                                )}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <>
                                        <MetricGroupRow
                                            label={CATEGORY_META.body.label}
                                            description={CATEGORY_META.body.description}
                                            icon={CATEGORY_META.body.icon}
                                            count={metricCounts.body}
                                            checked={includeBody}
                                            onChange={setIncludeBody}
                                        />
                                        <MetricGroupRow
                                            label={CATEGORY_META.performance.label}
                                            description={CATEGORY_META.performance.description}
                                            icon={CATEGORY_META.performance.icon}
                                            count={metricCounts.performance}
                                            checked={includePerformance}
                                            onChange={setIncludePerformance}
                                        />
                                        <MetricGroupRow
                                            label={CATEGORY_META.general.label}
                                            description={CATEGORY_META.general.description}
                                            icon={CATEGORY_META.general.icon}
                                            count={metricCounts.general}
                                            checked={includeGeneral}
                                            onChange={setIncludeGeneral}
                                        />
                                    </>
                                )}
                            </div>

                            {/* Fotos */}
                            <div className="space-y-3 border-t pt-4">
                                <div>
                                    <h4 className="text-sm font-semibold">Fotos de progreso</h4>
                                    <p className="text-xs text-muted-foreground">Configura si esta revisión solicita fotos al atleta.</p>
                                </div>

                                <div className="flex items-center justify-between rounded-lg border p-3">
                                    <div className="flex items-center gap-3">
                                        <Camera className="h-4 w-4 text-violet-500" />
                                        <div>
                                            <p className="text-sm font-medium">Solicitar fotos</p>
                                            <p className="text-xs text-muted-foreground">Mostrar el bloque de subida de fotos en el formulario.</p>
                                        </div>
                                    </div>
                                    <Switch checked={includePhotos} onCheckedChange={setIncludePhotos} />
                                </div>

                                {includePhotos && (
                                    <div className="grid grid-cols-2 gap-3 pl-1">
                                        <div className="flex items-center justify-between rounded-lg border p-3">
                                            <div>
                                                <p className="text-xs font-medium">Obligatorias</p>
                                                <p className="text-[11px] text-muted-foreground">Bloquear envío sin fotos</p>
                                            </div>
                                            <Switch checked={photosRequired} onCheckedChange={setPhotosRequired} />
                                        </div>
                                        <div>
                                            <Label htmlFor="rt-photo-max" className="text-xs">Máximo de fotos</Label>
                                            <Input
                                                id="rt-photo-max"
                                                type="number"
                                                min={1}
                                                max={20}
                                                value={photosMaxItems}
                                                onChange={(e) => setPhotosMaxItems(parseInt(e.target.value) || 6)}
                                                className="mt-1.5"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Estado */}
                            <div className="border-t pt-4">
                                <div className="flex items-center justify-between rounded-lg border p-3">
                                    <div>
                                        <p className="text-sm font-medium">Plantilla activa</p>
                                        <p className="text-xs text-muted-foreground">Solo las activas pueden asignarse a atletas.</p>
                                    </div>
                                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                                </div>
                            </div>

                        </TabsContent>
                    </Tabs>

                    {error && (
                        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="shrink-0 border-t px-6 py-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingTemplate ? 'Guardar cambios' : 'Crear revisión'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <FormBuilderModal
            open={formBuilderOpen}
            onOpenChange={(v) => {
                setFormBuilderOpen(v)
                if (!v) setFormBuilderEditing(null)
            }}
            templateType="checkin"
            editingTemplate={formBuilderEditing}
            onSave={handleFormBuilderSave}
        />
        </>
    )
}

function MetricGroupRow({
    label,
    description,
    icon,
    count,
    checked,
    onChange,
}: {
    label: string
    description: string
    icon: React.ReactNode
    count: number
    checked: boolean
    onChange: (v: boolean) => void
}) {
    const disabled = count === 0
    return (
        <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0">{icon}</div>
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{description}</p>
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className="text-[10px]">
                    {count} {count === 1 ? 'métrica' : 'métricas'}
                </Badge>
                <Switch
                    checked={checked && !disabled}
                    onCheckedChange={onChange}
                    disabled={disabled}
                />
            </div>
        </div>
    )
}
