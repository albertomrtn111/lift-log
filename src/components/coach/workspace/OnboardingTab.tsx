'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Calendar, AlertCircle, Activity, FileText, Images, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MetricDefinition } from '@/types/metrics'
import { CheckinPhotosViewer } from './CheckinPhotosViewer'

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
    metricDefinitions: MetricDefinition[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingTab({ clientId, coachId, metricDefinitions }: OnboardingTabProps) {
    const [loading, setLoading] = useState(true)
    const [checkin, setCheckin] = useState<OnboardingCheckin | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [query, setQuery] = useState('')

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

    if (loading) {
        return (
            <div className="space-y-3" aria-label="Cargando onboarding">
                <div className="h-20 animate-pulse rounded-2xl bg-muted/60" />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted/60" />)}
                </div>
                <div className="h-48 animate-pulse rounded-2xl bg-muted/60" />
            </div>
        )
    }

    if (error) {
        return (
            <EmptyState icon={AlertCircle} title="No se pudo cargar el onboarding" description={error} tone="danger" />
        )
    }

    if (!checkin) {
        return (
            <EmptyState
                icon={ClipboardList}
                title="Sin onboarding"
                description="Este atleta aún no ha completado el onboarding. Puedes enviárselo desde el menú de su ficha."
            />
        )
    }

    const payload = checkin.raw_payload || {}
    const schema = (checkin.form_templates?.schema as FormSchemaField[]) || []
    const submittedDate = checkin.submitted_at
        ? new Date(checkin.submitted_at).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : null

    const metricKeys = Object.keys(payload).filter(k => k.startsWith('metric_') && payload[k] !== null && payload[k] !== '')

    const getMetricDefinition = (key: string) => metricDefinitions.find(m => m.id === key.replace('metric_', ''))

    // Respuestas en el orden del formulario; sin esquema, todo lo que no sea métrica
    const responses: Array<{ id: string; label: string; value: unknown }> = schema.length > 0
        ? schema
            .filter(field => payload[field.id] !== undefined && payload[field.id] !== null)
            .map(field => ({ id: field.id, label: field.label, value: payload[field.id] }))
        : Object.entries(payload)
            .filter(([key]) => !key.startsWith('metric_'))
            .map(([key, value]) => ({ id: key, label: formatKey(key), value }))

    const needle = query.trim().toLowerCase()
    const visibleResponses = needle
        ? responses.filter(response => `${response.label} ${formatPlain(response.value)}`.toLowerCase().includes(needle))
        : responses

    return (
        <div className="space-y-6">
            <section className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm sm:p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Formulario de onboarding</p>
                    <h3 className="truncate text-[15px] font-semibold leading-tight">{checkin.form_templates?.title || 'Onboarding'}</h3>
                    {submittedDate && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 shrink-0" />
                            Completado el {submittedDate}
                        </p>
                    )}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Completado
                </span>
            </section>

            {metricKeys.length > 0 && (
                <section>
                    <SectionTitle icon={Activity} title="Medidas iniciales" count={metricKeys.length} />
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                        {metricKeys.map((key) => {
                            const definition = getMetricDefinition(key)
                            return (
                                <MetricBox
                                    key={key}
                                    label={definition?.name ?? 'Métrica'}
                                    value={payload[key] as number | string}
                                    unit={definition?.unit ?? ''}
                                />
                            )
                        })}
                    </div>
                </section>
            )}

            <section>
                <SectionTitle icon={FileText} title="Respuestas" count={responses.length} />
                {responses.length === 0 ? (
                    <EmptyState icon={FileText} title="Sin respuestas" description="El formulario se envió sin respuestas." />
                ) : (
                    <>
                        {responses.length > 12 && (
                            <div className="relative mb-2.5">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Buscar en las respuestas"
                                    className="h-10 rounded-full border-border/70 bg-muted/40 pl-9"
                                />
                            </div>
                        )}
                        {visibleResponses.length === 0 ? (
                            <p className="px-1 py-6 text-center text-sm text-muted-foreground">Ninguna respuesta coincide con «{query}».</p>
                        ) : (
                            <dl className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                                {visibleResponses.map(response => isInlineValue(response.value) ? (
                                    <div key={response.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                                        <dt className="min-w-0 text-sm text-muted-foreground">{response.label}</dt>
                                        <dd className="shrink-0 text-right text-sm font-semibold">
                                            <ResponseValue value={response.value} compact />
                                        </dd>
                                    </div>
                                ) : (
                                    <div key={response.id} className="px-4 py-3">
                                        <dt className="text-sm text-muted-foreground">{response.label}</dt>
                                        <dd className="mt-1 text-sm font-medium">
                                            <ResponseValue value={response.value} />
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </>
                )}
            </section>

            <section>
                <SectionTitle icon={Images} title="Fotos iniciales" />
                <CheckinPhotosViewer checkinId={checkin.id} coachId={coachId} />
            </section>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Respuestas que caben a la derecha de la pregunta; el resto va debajo */
function isInlineValue(value: unknown) {
    if (typeof value === 'number' || typeof value === 'boolean') return true
    if (typeof value === 'string') return value.trim().length <= 14 && !value.includes('\n')
    return false
}

function formatPlain(value: unknown): string {
    if (Array.isArray(value)) return value.map(String).join(' ')
    if (typeof value === 'object' && value !== null) return Object.values(value).map(String).join(' ')
    return String(value ?? '')
}

function SectionTitle({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
    return (
        <h4 className="mb-2.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {title}
            {count != null && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>}
        </h4>
    )
}

function EmptyState({ icon: Icon, title, description, tone }: { icon: React.ElementType; title: string; description?: string; tone?: 'danger' }) {
    return (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
            <div className={cn('mb-3 flex h-12 w-12 items-center justify-center rounded-2xl', tone === 'danger' ? 'bg-destructive/10' : 'bg-muted')}>
                <Icon className={cn('h-6 w-6', tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')} />
            </div>
            <p className="text-sm font-semibold">{title}</p>
            {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
        </div>
    )
}

function ResponseValue({ value, compact }: { value: unknown; compact?: boolean }) {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return <p className="text-sm text-muted-foreground italic">Sin respuesta</p>
        }
        return (
            <div className={cn('flex flex-wrap gap-1.5', compact && 'justify-end')}>
                {value.map((item, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                        {String(item)}
                    </Badge>
                ))}
            </div>
        )
    }

    if (typeof value === 'boolean') {
        return <span className={cn('text-sm font-semibold', value ? 'text-success' : 'text-muted-foreground')}>{value ? 'Sí' : 'No'}</span>
    }

    if (typeof value === 'number') {
        return <span className="text-sm font-semibold tabular-nums">{value.toLocaleString('es-ES')}</span>
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

    return compact ? <span className="break-words">{strValue}</span> : <p className="text-sm font-medium">{strValue}</p>
}

function MetricBox({
    label,
    value,
    unit = '',
}: {
    label: string
    value: number | string | null | undefined
    unit?: string
}) {
    return (
        <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm">
            <p className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums leading-none">
                {value !== null && value !== undefined ? value.toLocaleString('es-ES') : '—'}
                {unit && value !== null && value !== undefined && <span className="ml-0.5 text-xs font-medium text-muted-foreground">{unit}</span>}
            </p>
        </div>
    )
}

function formatKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase())
}
