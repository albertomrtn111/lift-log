'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ClipboardList, Calendar, AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingCheckin {
    id: string
    raw_payload: Record<string, unknown>
    submitted_at: string
    form_templates: {
        id: string
        title: string
        schema: FormSchemaField[]
    } | null
}

interface FormSchemaField {
    id: string
    label: string
    type: string
    options?: string[]
}

interface OnboardingTabProps {
    clientId: string
    coachId: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingTab({ clientId, coachId }: OnboardingTabProps) {
    const [loading, setLoading] = useState(true)
    const [checkin, setCheckin] = useState<OnboardingCheckin | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchOnboarding() {
            setLoading(true)
            setError(null)

            try {
                const supabase = createClient()

                const { data, error: fetchErr } = await supabase
                    .from('checkins')
                    .select(`
                        id,
                        raw_payload,
                        submitted_at,
                        form_templates (
                            id,
                            title,
                            schema
                        )
                    `)
                    .eq('client_id', clientId)
                    .eq('coach_id', coachId)
                    .eq('type', 'onboarding')
                    .eq('status', 'reviewed')
                    .order('submitted_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (fetchErr) {
                    console.error('[OnboardingTab] Fetch error:', fetchErr)
                    setError('Error al cargar el onboarding')
                    return
                }

                setCheckin(data as unknown as OnboardingCheckin | null)
            } catch (err) {
                console.error('[OnboardingTab] Exception:', err)
                setError('Error de conexión')
            } finally {
                setLoading(false)
            }
        }

        fetchOnboarding()
    }, [clientId, coachId])

    // Loading
    if (loading) {
        return (
            <Card className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-3">Cargando onboarding...</p>
            </Card>
        )
    }

    // Error
    if (error) {
        return (
            <Card className="p-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive/50 mx-auto mb-3" />
                <p className="text-sm text-destructive">{error}</p>
            </Card>
        )
    }

    // No onboarding found
    if (!checkin) {
        return (
            <Card className="p-12 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Sin onboarding</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    Este cliente aún no ha completado el onboarding.
                    Envíale un formulario desde la pestaña de Resumen.
                </p>
            </Card>
        )
    }

    // Parse data
    const payload = checkin.raw_payload || {}
    const schema = (checkin.form_templates?.schema as FormSchemaField[]) || []
    const submittedDate = checkin.submitted_at
        ? new Date(checkin.submitted_at).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        : null

    // If we have a schema, use it to render fields in order with labels
    // Otherwise, fall back to raw key-value rendering
    const hasSchema = schema.length > 0

    return (
        <div className="space-y-4">
            {/* Header */}
            <Card className="p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <ClipboardList className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold">
                                {checkin.form_templates?.title || 'Onboarding'}
                            </h3>
                            {submittedDate && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                    <Calendar className="h-3 w-3" />
                                    Completado el {submittedDate}
                                </div>
                            )}
                        </div>
                    </div>
                    <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/5">
                        Completado
                    </Badge>
                </div>
            </Card>

            {/* Responses */}
            {Object.keys(payload).length === 0 ? (
                <Card className="p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                        El formulario fue enviado sin respuestas.
                    </p>
                </Card>
            ) : hasSchema ? (
                <div className="grid gap-3">
                    {schema.map((field) => {
                        const value = payload[field.id]
                        if (value === undefined || value === null) return null

                        return (
                            <Card key={field.id} className="p-4">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                    {field.label}
                                </p>
                                <ResponseValue value={value} />
                            </Card>
                        )
                    })}
                </div>
            ) : (
                // Fallback: render raw key-value pairs
                <div className="grid gap-3">
                    {Object.entries(payload).map(([key, value]) => (
                        <Card key={key} className="p-4">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                {formatKey(key)}
                            </p>
                            <ResponseValue value={value} />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ResponseValue({ value }: { value: unknown }) {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return <p className="text-sm text-muted-foreground italic">Sin respuesta</p>
        }
        return (
            <div className="flex flex-wrap gap-1.5">
                {value.map((item, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                        {String(item)}
                    </Badge>
                ))}
            </div>
        )
    }

    if (typeof value === 'boolean') {
        return (
            <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                {value ? 'Sí' : 'No'}
            </Badge>
        )
    }

    if (typeof value === 'number') {
        return <p className="text-sm font-medium">{value}</p>
    }

    if (typeof value === 'object' && value !== null) {
        // Nested object — render as sub-fields
        return (
            <div className="space-y-2 pl-3 border-l-2 border-border">
                {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                    <div key={k}>
                        <p className="text-xs text-muted-foreground">{formatKey(k)}</p>
                        <p className="text-sm">{String(v)}</p>
                    </div>
                ))}
            </div>
        )
    }

    const strValue = String(value)
    if (!strValue || strValue === 'null' || strValue === 'undefined') {
        return <p className="text-sm text-muted-foreground italic">Sin respuesta</p>
    }

    // Multiline text (long answers)
    if (strValue.includes('\n') || strValue.length > 120) {
        return <p className="text-sm whitespace-pre-wrap leading-relaxed">{strValue}</p>
    }

    return <p className="text-sm font-medium">{strValue}</p>
}

function formatKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase())
}
