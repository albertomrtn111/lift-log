'use client'

import { useEffect, useState, useTransition } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { Loader2, Camera, Activity, Dumbbell, Layers, Sliders } from 'lucide-react'
import type { FormTemplate } from '@/types/forms'
import type { MetricCategory, MetricDefinition } from '@/types/metrics'
import type { ReviewTemplate, ReviewType } from '@/data/review-templates'
import {
    createReviewTemplateAction,
    updateReviewTemplateAction,
    listReviewTemplateMetricsAction,
} from './review-template-actions'

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
    checkinForms: Pick<FormTemplate, 'id' | 'title' | 'is_active'>[]
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

    // Nivel 2: selección avanzada por métrica
    const [advancedMode, setAdvancedMode] = useState(false)
    const [selectedMetricIds, setSelectedMetricIds] = useState<Set<string>>(new Set())
    const [loadingMetrics, setLoadingMetrics] = useState(false)

    // Reset al abrir / cambiar editingTemplate
    useEffect(() => {
        if (!open) return

        let cancelled = false
        async function init() {
            if (editingTemplate) {
                setName(editingTemplate.name)
                setDescription(editingTemplate.description ?? '')
                setReviewType(editingTemplate.review_type)
                setFormTemplateId(editingTemplate.form_template_id ?? '')
                setDefaultFrequencyDays(editingTemplate.default_frequency_days)
                setIncludeBody(editingTemplate.include_body_metrics)
                setIncludePerformance(editingTemplate.include_performance_metrics)
                setIncludeGeneral(editingTemplate.include_general_metrics)
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
        }
        init()
        return () => { cancelled = true }
    }, [open, editingTemplate])

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
        if (!name.trim()) {
            setError('El nombre es obligatorio')
            return
        }
        if (defaultFrequencyDays < 1 || defaultFrequencyDays > 365) {
            setError('La frecuencia debe estar entre 1 y 365 días')
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
            hasAnyMetric = includeBody || includePerformance || includeGeneral
            metricIdsPayload = [] // Limpia cualquier selección Nivel 2 anterior
        }

        const hasForm = !!formTemplateId
        const hasPhotos = includePhotos
        if (!hasForm && !hasAnyMetric && !hasPhotos) {
            setError('La plantilla está vacía. Selecciona al menos un formulario, métricas o activa las fotos.')
            return
        }

        if (!advancedMode) {
            if (includeBody && metricCounts.body === 0) {
                setError('Has marcado "Métricas corporales" pero no tienes ninguna activa en tu catálogo.')
                return
            }
            if (includePerformance && metricCounts.performance === 0) {
                setError('Has marcado "Métricas de rendimiento" pero no tienes ninguna activa en tu catálogo.')
                return
            }
            if (includeGeneral && metricCounts.general === 0) {
                setError('Has marcado "Métricas generales" pero no tienes ninguna activa en tu catálogo.')
                return
            }
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
                toast({ title: editingTemplate ? 'Plantilla actualizada' : 'Plantilla creada' })
                onOpenChange(false)
                router.refresh()
            } else {
                setError(result.error ?? 'Error inesperado')
            }
        })
    }

    const noFormSelected = !formTemplateId
    const metricsByCategory: Record<MetricCategory, MetricDefinition[]> = { body: [], performance: [], general: [] }
    for (const m of metrics) {
        const cat = m.category as MetricCategory
        if (cat in metricsByCategory) metricsByCategory[cat].push(m)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {editingTemplate ? 'Editar plantilla de revisión' : 'Nueva plantilla de revisión'}
                    </DialogTitle>
                    <DialogDescription>
                        Define qué se le pide al atleta cuando llegue esta revisión: formulario, métricas y fotos.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
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
                                    {checkinForms.map(f => (
                                        <SelectItem key={f.id} value={f.id}>
                                            {f.title}{!f.is_active && ' (inactivo)'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {noFormSelected && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5">
                                    Sin formulario, la revisión solo pedirá métricas o fotos.
                                </p>
                            )}
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

                    {error && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingTemplate ? 'Guardar cambios' : 'Crear plantilla'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
