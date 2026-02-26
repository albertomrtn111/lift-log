'use client'

import { FormField, FormFieldType } from '@/types/forms'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    ChevronUp,
    ChevronDown,
    Trash2,
    GripVertical,
} from 'lucide-react'

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
    { value: 'short_text', label: 'Respuesta corta' },
    { value: 'long_text', label: 'Respuesta larga' },
    { value: 'number', label: 'Número' },
    { value: 'scale', label: 'Escala' },
    { value: 'single_choice', label: 'Selector' },
    { value: 'multi_choice', label: 'Selección múltiple' },
    { value: 'date', label: 'Fecha' },
]

interface FormFieldEditorProps {
    field: FormField
    index: number
    total: number
    onChange: (updated: FormField) => void
    onMoveUp: () => void
    onMoveDown: () => void
    onDelete: () => void
    error?: string
}

export function FormFieldEditor({
    field,
    index,
    total,
    onChange,
    onMoveUp,
    onMoveDown,
    onDelete,
    error,
}: FormFieldEditorProps) {
    const update = (patch: Partial<FormField>) => onChange({ ...field, ...patch })

    const needsOptions = field.type === 'single_choice' || field.type === 'multi_choice'
    const needsMinMax = field.type === 'number'
    const isScale = field.type === 'scale'

    const handleTypeChange = (v: FormFieldType) => {
        const patch: Partial<FormField> = { type: v }

        // Set defaults / clear irrelevant fields per type
        if (v === 'single_choice' || v === 'multi_choice') {
            patch.options = field.options?.length ? field.options : ['', '']
            patch.min = undefined
            patch.max = undefined
            patch.step = undefined
        } else if (v === 'scale') {
            patch.min = field.min ?? 1
            patch.max = field.max ?? 10
            patch.step = field.step ?? 1
            patch.options = undefined
        } else if (v === 'number') {
            patch.options = undefined
            // keep min/max/step if they had values
        } else {
            // short_text, long_text, date
            patch.options = undefined
            patch.min = undefined
            patch.max = undefined
            patch.step = undefined
        }

        update(patch)
    }

    return (
        <Card className={`p-4 space-y-4 border ${error ? 'border-destructive' : 'border-border'}`}>
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                        Campo {index + 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 font-mono">
                        {field.id}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onMoveUp}
                        disabled={index === 0}
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onMoveDown}
                        disabled={index === total - 1}
                    >
                        <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Pregunta — free text, never auto-modified */}
            <div className="space-y-1.5">
                <Label className="text-xs">Pregunta</Label>
                <Textarea
                    value={field.label}
                    onChange={(e) => update({ label: e.target.value })}
                    placeholder="Ej. ¿Cómo te has sentido esta semana? ¿Has notado mejoras?"
                    rows={2}
                    className="text-sm resize-none min-h-[40px]"
                />
            </div>

            {/* Type + Required row */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de respuesta</Label>
                    <Select value={field.type} onValueChange={(v) => handleTypeChange(v as FormFieldType)}>
                        <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FIELD_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={field.required}
                            onCheckedChange={(v) => update({ required: v })}
                            id={`required-${field.id}`}
                        />
                        <Label htmlFor={`required-${field.id}`} className="text-xs">
                            Obligatorio
                        </Label>
                    </div>
                </div>
            </div>

            {/* Scale config */}
            {isScale && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Mínimo</Label>
                        <Input
                            type="number"
                            value={field.min ?? 1}
                            onChange={(e) => update({ min: e.target.value ? Number(e.target.value) : 1 })}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Máximo</Label>
                        <Input
                            type="number"
                            value={field.max ?? 10}
                            onChange={(e) => update({ max: e.target.value ? Number(e.target.value) : 10 })}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Incremento</Label>
                        <Input
                            type="number"
                            value={field.step ?? 1}
                            onChange={(e) => update({ step: e.target.value ? Number(e.target.value) : 1 })}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>
            )}

            {/* Number optional min/max/step */}
            {needsMinMax && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Min (opcional)</Label>
                        <Input
                            type="number"
                            value={field.min ?? ''}
                            onChange={(e) => update({ min: e.target.value ? Number(e.target.value) : null })}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Max (opcional)</Label>
                        <Input
                            type="number"
                            value={field.max ?? ''}
                            onChange={(e) => update({ max: e.target.value ? Number(e.target.value) : null })}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Incremento (opcional)</Label>
                        <Input
                            type="number"
                            value={field.step ?? ''}
                            onChange={(e) => update({ step: e.target.value ? Number(e.target.value) : null })}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>
            )}

            {/* Options for choice types */}
            {needsOptions && (
                <div className="space-y-1.5">
                    <Label className="text-xs">Opciones (una por línea, mínimo 2)</Label>
                    <Textarea
                        value={(field.options || []).join('\n')}
                        onChange={(e) => update({ options: e.target.value.split('\n') })}
                        placeholder={'Opción 1\nOpción 2\nOpción 3'}
                        rows={3}
                        className="text-sm"
                    />
                </div>
            )}

            {/* Help text */}
            <div className="space-y-1.5">
                <Label className="text-xs">Texto de ayuda (opcional)</Label>
                <Input
                    value={field.helpText ?? ''}
                    onChange={(e) => update({ helpText: e.target.value || null })}
                    placeholder="Instrucciones adicionales para el usuario"
                    className="h-8 text-sm"
                />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
        </Card>
    )
}
