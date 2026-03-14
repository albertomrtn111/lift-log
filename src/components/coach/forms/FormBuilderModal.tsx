'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { FormField, FormTemplate, FormFieldType, PROGRESS_PHOTOS_FIELD } from '@/types/forms'
import { FormFieldEditor } from './FormFieldEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Loader2, Camera, Lock } from 'lucide-react'

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
    onSave: (data: { title: string; schema: FormField[] }) => Promise<void>
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
    onSave,
}: FormBuilderModalProps) {
    const getInitialFields = useCallback(() => {
        if (!editingTemplate?.schema?.length) return []
        // Filter out the fixed photo field — we manage it separately
        return migrateSchema(
            (editingTemplate.schema as unknown[]).filter(
                (f: any) => !(f.id === 'progress_photos' || (f.type === 'photo_upload' && f.isFixed))
            )
        )
    }, [editingTemplate])

    const [title, setTitle] = useState('')
    const [fields, setFields] = useState<FormField[]>([])
    const [saving, setSaving] = useState(false)
    const [errors, setErrors] = useState<Record<number, string>>({})
    const [titleError, setTitleError] = useState('')

    const nextFieldNumberRef = useRef<number>(
        computeNextFieldNumber(getInitialFields())
    )

    useEffect(() => {
        if (open) {
            setTitle(editingTemplate?.title ?? '')
            const schema = getInitialFields()
            setFields(schema)
            setErrors({})
            setTitleError('')
            nextFieldNumberRef.current = computeNextFieldNumber(schema)
        }
    }, [open, editingTemplate, getInitialFields])

    // Pass the open state up
    const handleOpenChange = (v: boolean) => {
        onOpenChange(v)
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

    // -----------------------------------------------------------------------
    // Save
    // -----------------------------------------------------------------------

    const handleSave = async () => {
        if (!validate()) return
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

            await onSave({ title: title.trim(), schema: cleanedFields })
            // Note: The fixed photo field is NOT included here.
            // The server-side CRUD (form-templates.ts) auto-injects it via ensurePhotoField().
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {editingTemplate ? 'Editar Plantilla' : 'Crear Plantilla'}
                        <Badge variant="outline" className="text-xs">
                            {TYPE_LABELS[templateType]}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    {/* Title */}
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

                    {/* Fields */}
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
                            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                                <p className="text-sm">Aún no hay campos</p>
                                <p className="text-xs mt-1">
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

                        {/* Fixed photo upload block — always last, not editable */}
                        <Card className="p-4 border border-dashed border-blue-500/30 bg-blue-500/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                        <Camera className="h-4 w-4 text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                                {PROGRESS_PHOTOS_FIELD.label}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] px-1.5 border-blue-500/30 text-blue-400">
                                                <Lock className="h-2.5 w-2.5 mr-0.5" />
                                                Fijo
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {PROGRESS_PHOTOS_FIELD.helpText}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground/50 font-mono">
                                    {PROGRESS_PHOTOS_FIELD.id}
                                </span>
                            </div>
                        </Card>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
