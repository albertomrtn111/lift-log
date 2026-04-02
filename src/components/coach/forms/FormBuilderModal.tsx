'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
    FormField,
    FormTemplate,
    FormFieldType,
    FormBuilderInitialData,
    PROGRESS_PHOTOS_FIELD,
} from '@/types/forms'
import type { Client } from '@/types/coach'
import { FormFieldEditor } from './FormFieldEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Loader2, Camera, Lock, Sparkles, ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// -------------------------------------------------------------------------
// Legacy type migration — map old types to new MVP types
// -------------------------------------------------------------------------

const LEGACY_TYPE_MAP: Record<string, FormFieldType> = {
    text: 'short_text',
    textarea: 'long_text',
    radio: 'single_choice',
    select: 'single_choice',
    dropdown: 'single_choice',
    checkbox: 'multi_choice',
    slider: 'scale',
}

/** Migrate a single field from legacy schema to new schema */
function migrateField(raw: Record<string, unknown>): FormField {
    const oldType = (raw.type as string) || 'short_text'
    const newType = (LEGACY_TYPE_MAP[oldType] ?? oldType) as FormFieldType

    return {
        id: (raw.id as string) || (raw.key as string) || '',
        label: (raw.label as string) || '',
        type: newType,
        required: (raw.required as boolean) ?? false,
        min: (raw.min as number) ?? (newType === 'scale' ? 1 : null),
        max: (raw.max as number) ?? (newType === 'scale' ? 10 : null),
        step: (raw.step as number) ?? (newType === 'scale' ? 1 : null),
        options: raw.options as string[] | undefined,
        helpText: (raw.helpText as string) || (raw.help as string) || null,
    }
}

/** Migrate an entire schema array */
function migrateSchema(schema: unknown[]): FormField[] {
    return schema.map((raw) => migrateField(raw as Record<string, unknown>))
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

interface FormBuilderModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    templateType: 'checkin' | 'onboarding' | 'general'
    editingTemplate?: FormTemplate | null
    initialData?: FormBuilderInitialData | null
    activeClients?: Pick<Client, 'id' | 'full_name'>[]
    onSave: (data: { title: string; schema: FormField[]; assigned_client_ids?: string[] }) => Promise<void>
}

const TYPE_LABELS: Record<string, string> = {
    checkin: 'Check-in',
    onboarding: 'Onboarding',
    general: 'General',
}

/**
 * Compute nextFieldNumber from existing IDs matching "campo_N".
 */
function computeNextFieldNumber(fields: FormField[]): number {
    let max = 0
    for (const f of fields) {
        const match = f.id.match(/^campo_(\d+)$/)
        if (match) max = Math.max(max, Number(match[1]))
    }
    return max + 1
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function FormBuilderModal({
    open,
    onOpenChange,
    templateType,
    editingTemplate,
    initialData,
    activeClients = [],
    onSave,
}: FormBuilderModalProps) {
    const getInitialFields = useCallback(() => {
        const sourceSchema = editingTemplate?.schema?.length ? editingTemplate.schema : initialData?.schema
        if (!sourceSchema?.length) return []
        // Filter out the fixed photo field — we manage it separately
        return migrateSchema(
            (sourceSchema as unknown[]).filter(
                (f: any) => !(f.id === 'progress_photos' || (f.type === 'photo_upload' && f.isFixed))
            )
        )
    }, [editingTemplate, initialData])

    const [title, setTitle] = useState('')
    const [fields, setFields] = useState<FormField[]>([])
    const [saving, setSaving] = useState(false)
    const [errors, setErrors] = useState<Record<number, string>>({})
    const [titleError, setTitleError] = useState('')
    const [step, setStep] = useState<'builder' | 'assignments'>('builder')
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
    const [assignmentError, setAssignmentError] = useState('')
    const [assignmentSearch, setAssignmentSearch] = useState('')

    const nextFieldNumberRef = useRef<number>(
        computeNextFieldNumber(getInitialFields())
    )

    useEffect(() => {
        if (open) {
            setTitle(editingTemplate?.title ?? initialData?.title ?? '')
            const schema = getInitialFields()
            setFields(schema)
            setErrors({})
            setTitleError('')
            setAssignmentError('')
            setAssignmentSearch('')
            setStep('builder')
            setSelectedClientIds(
                (templateType === 'checkin' || templateType === 'onboarding')
                    ? (
                        editingTemplate
                            ? ((editingTemplate.assigned_client_ids?.length ?? 0) > 0
                                ? editingTemplate.assigned_client_ids
                                : editingTemplate.is_default
                                    ? activeClients.map((client) => client.id)
                                    : [])
                            : activeClients.map((client) => client.id)
                    )
                    : []
            )
            nextFieldNumberRef.current = computeNextFieldNumber(schema)
        }
    }, [open, editingTemplate, getInitialFields, initialData, templateType, activeClients])

    // Pass the open state up
    const handleOpenChange = (v: boolean) => {
        onOpenChange(v)
    }

    const isAssignableTemplate = templateType === 'checkin' || templateType === 'onboarding'
    const assignmentEntityLabel = templateType === 'onboarding' ? 'onboarding' : 'check-in'

    const filteredClients = activeClients.filter((client) =>
        client.full_name.toLowerCase().includes(assignmentSearch.trim().toLowerCase())
    )

    const visibleClientIds = filteredClients.map((client) => client.id)
    const visibleSelectedCount = visibleClientIds.filter((clientId) => selectedClientIds.includes(clientId)).length
    const allVisibleSelected = visibleClientIds.length > 0 && visibleSelectedCount === visibleClientIds.length

    const toggleClient = (clientId: string, checked: boolean) => {
        setAssignmentError('')
        setSelectedClientIds((prev) =>
            checked
                ? Array.from(new Set([...prev, clientId]))
                : prev.filter((id) => id !== clientId)
        )
    }

    const toggleAllVisible = (checked: boolean) => {
        setAssignmentError('')
        setSelectedClientIds((prev) => {
            if (checked) {
                return Array.from(new Set([...prev, ...visibleClientIds]))
            }

            const visibleSet = new Set(visibleClientIds)
            return prev.filter((id) => !visibleSet.has(id))
        })
    }

    const addField = () => {
        const id = `campo_${nextFieldNumberRef.current}`
        nextFieldNumberRef.current += 1
        const newField: FormField = {
            id,
            label: '',
            type: 'short_text',
            required: false,
            helpText: null,
        }
        // Insert at end of editable fields (before the fixed photo block)
        setFields((prev) => [...prev, newField])
    }

    const updateField = useCallback((index: number, updated: FormField) => {
        setFields((prev) => prev.map((f, i) => (i === index ? updated : f)))
    }, [])

    const moveField = useCallback((from: number, to: number) => {
        setFields((prev) => {
            if (to < 0 || to >= prev.length) return prev
            const next = [...prev]
            const [item] = next.splice(from, 1)
            next.splice(to, 0, item)
            return next
        })
    }, [])

    const deleteField = useCallback((index: number) => {
        setFields((prev) => prev.filter((_, i) => i !== index))
    }, [])

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    const validate = (): boolean => {
        let valid = true
        const newErrors: Record<number, string> = {}

        if (!title.trim()) {
            setTitleError('El título es obligatorio')
            valid = false
        } else {
            setTitleError('')
        }

        if (fields.length === 0) {
            setTitleError((prev) => prev || 'Añade al menos un campo')
            valid = false
        }

        fields.forEach((f, i) => {
            if (!f.label.trim()) {
                newErrors[i] = 'La pregunta es obligatoria'
                valid = false
            }

            if ((f.type === 'single_choice' || f.type === 'multi_choice')) {
                const validOptions = (f.options || []).filter(Boolean)
                if (validOptions.length < 2) {
                    newErrors[i] = newErrors[i] || 'Se requieren al menos 2 opciones'
                    valid = false
                }
            }

            if (f.type === 'scale') {
                const min = f.min ?? 1
                const max = f.max ?? 10
                const step = f.step ?? 1
                if (min >= max) {
                    newErrors[i] = newErrors[i] || 'El mínimo debe ser menor que el máximo'
                    valid = false
                }
                if (step <= 0) {
                    newErrors[i] = newErrors[i] || 'El incremento debe ser mayor que 0'
                    valid = false
                }
            }

            if (f.type === 'number' && f.min != null && f.max != null && f.min > f.max) {
                newErrors[i] = newErrors[i] || 'Min debe ser ≤ Max'
                valid = false
            }
        })

        setErrors(newErrors)
        return valid
    }

    const validateAssignments = (): boolean => {
        if (!isAssignableTemplate) return true
        if (selectedClientIds.length > 0) {
            setAssignmentError('')
            return true
        }

        setAssignmentError(`Selecciona al menos un atleta para esta plantilla de ${assignmentEntityLabel}`)
        return false
    }

    // -----------------------------------------------------------------------
    // Save
    // -----------------------------------------------------------------------

    const handleSave = async () => {
        if (!validate()) return
        if (!validateAssignments()) {
            setStep('assignments')
            return
        }
        setSaving(true)
        try {
            const cleanedFields: FormField[] = fields.map((f) => {
                const base: FormField = {
                    id: f.id,
                    label: f.label.trim(),
                    type: f.type,
                    required: f.required,
                    helpText: f.helpText || null,
                }

                if (f.type === 'single_choice' || f.type === 'multi_choice') {
                    base.options = (f.options || []).filter(Boolean)
                }

                if (f.type === 'number') {
                    if (f.min != null) base.min = f.min
                    if (f.max != null) base.max = f.max
                    if (f.step != null) base.step = f.step
                }

                if (f.type === 'scale') {
                    base.min = f.min ?? 1
                    base.max = f.max ?? 10
                    base.step = f.step ?? 1
                }

                return base
            })

            await onSave({
                title: title.trim(),
                schema: cleanedFields,
                assigned_client_ids: isAssignableTemplate ? selectedClientIds : undefined,
            })
            // Note: The fixed photo field is NOT included here.
            // The server-side CRUD (form-templates.ts) auto-injects it via ensurePhotoField().
        } finally {
            setSaving(false)
        }
    }

    const handleNextStep = () => {
        if (!validate()) return
        setStep('assignments')
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {editingTemplate ? 'Editar Plantilla' : initialData ? 'Revisar Formulario IA' : 'Crear Plantilla'}
                        <Badge variant="outline" className="text-xs">
                            {TYPE_LABELS[templateType]}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                {step === 'builder' && (
                    <div className="space-y-6 py-2">
                        {initialData && !editingTemplate && (
                            <Card className="border-primary/20 bg-primary/5 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Borrador generado con IA</p>
                                        <p className="text-xs text-muted-foreground">
                                            Revisa las preguntas, añade o quita campos si quieres, y luego guarda la plantilla.
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        <div className="space-y-1.5">
                            <Label>Título de la plantilla</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ej. Check-in semanal"
                                className={titleError ? 'border-destructive' : ''}
                            />
                            {titleError && (
                                <p className="text-xs text-destructive">{titleError}</p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">
                                    Campos ({fields.length})
                                </Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addField}
                                    className="gap-1.5"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Añadir Campo
                                </Button>
                            </div>

                            {fields.length === 0 && (
                                <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
                                    <p className="text-sm">Aún no hay campos</p>
                                    <p className="mt-1 text-xs">
                                        Haz clic en &quot;Añadir Campo&quot; para empezar a crear tu formulario
                                    </p>
                                </div>
                            )}

                            {fields.map((field, i) => (
                                <FormFieldEditor
                                    key={field.id}
                                    field={field}
                                    index={i}
                                    total={fields.length}
                                    onChange={(updated) => updateField(i, updated)}
                                    onMoveUp={() => moveField(i, i - 1)}
                                    onMoveDown={() => moveField(i, i + 1)}
                                    onDelete={() => deleteField(i)}
                                    error={errors[i]}
                                />
                            ))}

                            <Card className="border border-dashed border-blue-500/30 bg-blue-500/5 p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                                            <Camera className="h-4 w-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    {PROGRESS_PHOTOS_FIELD.label}
                                                </span>
                                                <Badge variant="outline" className="border-blue-500/30 px-1.5 text-[10px] text-blue-400">
                                                    <Lock className="mr-0.5 h-2.5 w-2.5" />
                                                    Fijo
                                                </Badge>
                                            </div>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {PROGRESS_PHOTOS_FIELD.helpText}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="font-mono text-[10px] text-muted-foreground/50">
                                        {PROGRESS_PHOTOS_FIELD.id}
                                    </span>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

                {step === 'assignments' && isAssignableTemplate && (
                    <div className="space-y-5 py-2">
                        <Card className="border-primary/20 bg-primary/5 p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Asignación de atletas</p>
                                <p className="text-xs text-muted-foreground">
                                    Selecciona quién recibirá este {assignmentEntityLabel}. Si eliges un atleta que ya estaba en otra plantilla de {assignmentEntityLabel}, se moverá automáticamente a esta para evitar duplicados.
                                </p>
                            </div>
                        </Card>

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={assignmentSearch}
                                    onChange={(e) => setAssignmentSearch(e.target.value)}
                                    placeholder="Buscar atleta..."
                                    className="pl-9"
                                />
                            </div>
                            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                {selectedClientIds.length} seleccionado{selectedClientIds.length === 1 ? '' : 's'}
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                                <p className="text-sm font-medium">Seleccionar todos los visibles</p>
                                <p className="text-xs text-muted-foreground">
                                    Usa esta opción para asignar el {assignmentEntityLabel} a todos y luego desmarcar algunos si quieres.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {visibleSelectedCount}/{visibleClientIds.length || 0}
                                </span>
                                <Checkbox
                                    checked={allVisibleSelected}
                                    onCheckedChange={(checked) => toggleAllVisible(Boolean(checked))}
                                />
                            </div>
                        </div>

                        <Card className="overflow-hidden">
                            <ScrollArea className="h-[320px]">
                                <div className="space-y-2 p-3">
                                    {filteredClients.length === 0 && (
                                        <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
                                            <p className="text-sm">No se encontraron atletas</p>
                                            <p className="mt-1 text-xs">
                                                Ajusta la búsqueda o añade clientes activos para asignar este {assignmentEntityLabel}.
                                            </p>
                                        </div>
                                    )}

                                    {filteredClients.map((client) => {
                                        const checked = selectedClientIds.includes(client.id)

                                        return (
                                            <button
                                                type="button"
                                                key={client.id}
                                                onClick={() => toggleClient(client.id, !checked)}
                                                className={cn(
                                                    'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                                                    checked
                                                        ? 'border-primary bg-primary/5'
                                                        : 'hover:border-muted-foreground/30 hover:bg-muted/20'
                                                )}
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium">{client.full_name}</p>
                                                </div>
                                                <Checkbox
                                                    checked={checked}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onCheckedChange={(value) => toggleClient(client.id, Boolean(value))}
                                                />
                                            </button>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </Card>

                        {assignmentError && (
                            <p className="text-xs text-destructive">{assignmentError}</p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {step === 'builder' ? (
                        <>
                            <Button
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                                disabled={saving}
                            >
                                Cancelar
                            </Button>
                            {isAssignableTemplate ? (
                                <Button onClick={handleNextStep} disabled={saving} className="gap-2">
                                    Siguiente
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                onClick={() => setStep('builder')}
                                disabled={saving}
                                className="gap-2"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Volver
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
