'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FormField, FormFieldType } from '@/types/forms'
import { MetricDefinition } from '@/types/metrics'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { submitFormAction } from '@/data/form-submit'
import { PhotoUploadBlock } from './PhotoUploadBlock'

// -------------------------------------------------------------------------
// Legacy type migration (for templates created before the new type system)
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

function migrateFieldType(raw: string): FormFieldType {
    return (LEGACY_TYPE_MAP[raw] ?? raw) as FormFieldType
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

interface DynamicFormProps {
    checkinId: string
    templateTitle: string
    templateType: string
    schema: FormField[]
    coachId: string
    clientId: string
    metrics?: MetricDefinition[]
    initialValues?: Record<string, unknown>
}

export function DynamicForm({ checkinId, templateTitle, templateType, schema, coachId, clientId, metrics = [], initialValues }: DynamicFormProps) {
    const router = useRouter()
    const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [isOnboarding, setIsOnboarding] = useState(false)

    const setValue = useCallback((fieldId: string, value: unknown) => {
        setValues(prev => ({ ...prev, [fieldId]: value }))
        setErrors(prev => {
            const next = { ...prev }
            delete next[fieldId]
            return next
        })
    }, [])

    // Multi-choice toggle
    const toggleMultiChoice = useCallback((fieldId: string, option: string) => {
        setValues(prev => {
            const current = (prev[fieldId] as string[]) || []
            const next = current.includes(option)
                ? current.filter(o => o !== option)
                : [...current, option]
            return { ...prev, [fieldId]: next }
        })
    }, [])

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {}

        for (const field of schema) {
            if (field.type === 'photo_upload') continue // photos handled separately
            const type = migrateFieldType(field.type)
            const val = values[field.id]

            if (field.required) {
                if (type === 'multi_choice') {
                    if (!val || (val as string[]).length === 0) {
                        newErrors[field.id] = 'Selecciona al menos una opción'
                    }
                } else if (val === undefined || val === null || val === '') {
                    newErrors[field.id] = 'Este campo es obligatorio'
                }
            }

            if (type === 'number' && val !== undefined && val !== '' && val !== null) {
                const num = Number(val)
                if (isNaN(num)) {
                    newErrors[field.id] = 'Introduce un número válido'
                } else {
                    if (field.min != null && num < field.min) {
                        newErrors[field.id] = `Mínimo: ${field.min}`
                    }
                    if (field.max != null && num > field.max) {
                        newErrors[field.id] = `Máximo: ${field.max}`
                    }
                }
            }

            if (type === 'scale' && val !== undefined && val !== '' && val !== null) {
                const num = Number(val)
                const min = field.min ?? 1
                const max = field.max ?? 10
                if (isNaN(num) || num < min || num > max) {
                    newErrors[field.id] = `Valor entre ${min} y ${max}`
                }
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        setSubmitting(true)
        setSubmitError(null)

        // Clean values: convert number strings to actual numbers
        const cleanedPayload: Record<string, unknown> = {}
        for (const field of schema) {
            if (field.type === 'photo_upload') continue // photos handled separately
            const type = migrateFieldType(field.type)
            const val = values[field.id]
            if (type === 'number' || type === 'scale') {
                cleanedPayload[field.id] = val !== undefined && val !== '' ? Number(val) : null
            } else {
                cleanedPayload[field.id] = val ?? null
            }
        }

        // Add metrics values to payload
        for (const metric of metrics) {
            const val = values[`metric_${metric.id}`]
            if (metric.value_type === 'number' || metric.value_type === 'scale') {
                cleanedPayload[`metric_${metric.id}`] = val !== undefined && val !== '' && val !== null ? Number(val) : null
            } else {
                cleanedPayload[`metric_${metric.id}`] = val ?? null
            }
        }

        try {
            const result = await submitFormAction(checkinId, cleanedPayload)
            if (result.success) {
                setSubmitted(true)
                setIsOnboarding(!!result.isOnboarding)

                // Redirect to client dashboard after onboarding
                if (result.isOnboarding) {
                    setTimeout(() => {
                        router.push('/planning')
                    }, 2000)
                }
            } else {
                setSubmitError(result.error || 'Error al enviar')
            }
        } catch {
            setSubmitError('Error de conexión. Inténtalo de nuevo.')
        } finally {
            setSubmitting(false)
        }
    }

    if (submitted) {
        return (
            <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <h2 className="text-xl font-semibold">
                    {isOnboarding ? '¡Onboarding completado!' : '¡Formulario enviado!'}
                </h2>
                <p className="text-muted-foreground">
                    {isOnboarding
                        ? 'Tu onboarding ha sido completado correctamente. Redirigiendo a tu panel...'
                        : 'Tus respuestas han sido guardadas correctamente. Tu entrenador las revisará pronto.'
                    }
                </p>
                {isOnboarding && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirigiendo...
                    </div>
                )}
            </Card>
        )
    }

    const typeLabel = templateType === 'onboarding' ? 'Onboarding' : templateType === 'checkin' ? 'Check-in' : 'Formulario'

    return (
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-6">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">{templateTitle}</h1>
                    <Badge variant="outline">{typeLabel}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                    Completa todos los campos obligatorios y envía tus respuestas.
                </p>
            </div>

            <div className="space-y-4">
                {/* Metric definitions block */}
                {metrics && metrics.length > 0 && (
                    <div className="space-y-4 mb-8">
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold">📊 Métricas de seguimiento</h2>
                            <p className="text-sm text-muted-foreground">
                                Rellena las que apliquen — ninguna es obligatoria
                            </p>
                        </div>
                        {metrics.map((metric) => (
                            <MetricFieldRenderer
                                key={metric.id}
                                metric={metric}
                                value={values[`metric_${metric.id}`]}
                                onChange={(val) => setValue(`metric_${metric.id}`, val)}
                            />
                        ))}
                    </div>
                )}

                {/* Preguntas de la plantilla */}
                {schema.filter((field) => field.type !== 'photo_upload').length > 0 && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold">💬 Preguntas de tu entrenador</h2>
                            <p className="text-sm text-muted-foreground">
                                Responde con la mayor honestidad posible
                            </p>
                        </div>
                        {schema
                            .filter((field) => field.type !== 'photo_upload')
                            .map((field) => (
                                <FieldRenderer
                                    key={field.id}
                                    field={field}
                                    value={values[field.id]}
                                    error={errors[field.id]}
                                    onChange={(val) => setValue(field.id, val)}
                                    onToggleMulti={(opt) => toggleMultiChoice(field.id, opt)}
                                />
                            ))}
                    </div>
                )}
            </div>

            {/* Photo upload block — renders independently of form submit */}
            {schema.some((f) => f.type === 'photo_upload') && (
                <PhotoUploadBlock
                    checkinId={checkinId}
                    coachId={coachId}
                    clientId={clientId}
                    maxItems={schema.find((f) => f.type === 'photo_upload')?.maxItems ?? 6}
                />
            )}

            {submitError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {submitError}
                </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar respuestas
            </Button>
        </form>
    )
}

// -------------------------------------------------------------------------
// Field Renderer
// -------------------------------------------------------------------------

function FieldRenderer({
    field,
    value,
    error,
    onChange,
    onToggleMulti,
}: {
    field: FormField
    value: unknown
    error?: string
    onChange: (val: unknown) => void
    onToggleMulti: (opt: string) => void
}) {
    const type = migrateFieldType(field.type)
    const helpText = field.helpText || (field as any).help

    return (
        <Card className={`p-4 space-y-2 ${error ? 'border-destructive' : ''}`}>
            <div className="space-y-1">
                <Label className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {helpText && (
                    <p className="text-xs text-muted-foreground">{helpText}</p>
                )}
            </div>

            {type === 'short_text' && (
                <Input
                    value={(value as string) ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Escribe tu respuesta..."
                    className="text-sm"
                />
            )}

            {type === 'long_text' && (
                <Textarea
                    value={(value as string) ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Escribe tu respuesta..."
                    rows={3}
                    className="text-sm"
                />
            )}

            {type === 'number' && (
                <Input
                    type="number"
                    value={value !== undefined && value !== null ? String(value) : ''}
                    onChange={(e) => onChange(e.target.value)}
                    min={field.min ?? undefined}
                    max={field.max ?? undefined}
                    step={field.step ?? undefined}
                    placeholder="0"
                    className="text-sm"
                />
            )}

            {type === 'scale' && (
                <ScaleInput
                    value={value as number | undefined}
                    min={field.min ?? 1}
                    max={field.max ?? 10}
                    step={field.step ?? 1}
                    onChange={onChange}
                />
            )}

            {type === 'single_choice' && (
                <Select
                    value={(value as string) ?? ''}
                    onValueChange={(v) => onChange(v)}
                >
                    <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Selecciona una opción" />
                    </SelectTrigger>
                    <SelectContent>
                        {(field.options || []).filter(Boolean).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                                {opt}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            {type === 'multi_choice' && (
                <div className="space-y-2">
                    {(field.options || []).filter(Boolean).map((opt) => {
                        const selected = ((value as string[]) || []).includes(opt)
                        return (
                            <div key={opt} className="flex items-center gap-2">
                                <Switch
                                    checked={selected}
                                    onCheckedChange={() => onToggleMulti(opt)}
                                    id={`${field.id}-${opt}`}
                                />
                                <Label
                                    htmlFor={`${field.id}-${opt}`}
                                    className="text-sm cursor-pointer"
                                >
                                    {opt}
                                </Label>
                            </div>
                        )
                    })}
                </div>
            )}

            {type === 'date' && (
                <Input
                    type="date"
                    value={(value as string) ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="text-sm"
                />
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
        </Card>
    )
}

// -------------------------------------------------------------------------
// Metric Field Renderer
// -------------------------------------------------------------------------

function MetricFieldRenderer({
    metric,
    value,
    onChange,
}: {
    metric: MetricDefinition
    value: unknown
    onChange: (val: unknown) => void
}) {
    return (
        <Card className="p-4 space-y-2 relative overflow-hidden">
             {/* Un sutil highlight para diferenciar las métricas de las preguntas normales */}
             <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20" />
            
            <div className="space-y-1">
                <Label className="text-sm font-medium">
                    {metric.name}
                </Label>
                {metric.description && (
                    <p className="text-xs text-muted-foreground">{metric.description}</p>
                )}
            </div>

            {metric.value_type === 'number' && (
                <div className="relative">
                    <Input
                        type="number"
                        value={value !== undefined && value !== null ? String(value) : ''}
                        onChange={(e) => onChange(e.target.value)}
                        min={metric.min_value ?? undefined}
                        max={metric.max_value ?? undefined}
                        step="any"
                        placeholder="0"
                        className={`text-sm ${metric.unit ? 'pr-12' : ''}`}
                    />
                    {metric.unit && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-sm text-muted-foreground">
                            {metric.unit}
                        </div>
                    )}
                </div>
            )}

            {metric.value_type === 'scale' && (
                <ScaleInput
                    value={value as number | undefined}
                    min={metric.min_value ?? 1}
                    max={metric.max_value ?? 10}
                    step={1}
                    onChange={onChange}
                />
            )}

            {metric.value_type === 'text' && (
                <Textarea
                    value={(value as string) ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Escribe tu respuesta..."
                    rows={2}
                    className="text-sm resize-none"
                />
            )}
        </Card>
    )
}

// -------------------------------------------------------------------------
// Scale Input — clickable buttons
// -------------------------------------------------------------------------

function ScaleInput({
    value,
    min,
    max,
    step,
    onChange,
}: {
    value: number | undefined
    min: number
    max: number
    step: number
    onChange: (val: number) => void
}) {
    const options: number[] = []
    for (let i = min; i <= max; i += step) {
        options.push(i)
    }

    // If too many options (> 15), use a slider-like input instead
    if (options.length > 15) {
        return (
            <div className="space-y-2">
                <Input
                    type="number"
                    value={value ?? ''}
                    onChange={(e) => onChange(Number(e.target.value))}
                    min={min}
                    max={max}
                    step={step}
                    className="text-sm"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{min}</span>
                    <span>{max}</span>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
                <Button
                    key={opt}
                    type="button"
                    variant={value === opt ? 'default' : 'outline'}
                    size="sm"
                    className="min-w-[40px]"
                    onClick={() => onChange(opt)}
                >
                    {opt}
                </Button>
            ))}
        </div>
    )
}
