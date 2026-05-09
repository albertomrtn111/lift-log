import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { DynamicForm } from '@/components/forms/DynamicForm'
import { Card } from '@/components/ui/card'
import { AlertCircle, Lock } from 'lucide-react'
import type { FormField } from '@/types/forms'
import type { MetricDefinition, MetricCategory } from '@/types/metrics'
import type { ReviewTemplate } from '@/data/review-templates'

interface PageProps {
    params: Promise<{ checkinId: string }>
}

export default async function FormPage({ params }: PageProps) {
    const { checkinId } = await params
    const supabase = await createClient()

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/login?redirect=/forms/${checkinId}`)

    // 2. Cargar checkin con joins (form_template y review_template)
    const admin = createAdminClient()
    const { data: checkin, error: checkinErr } = await admin
        .from('checkins')
        .select(`
            id,
            coach_id,
            client_id,
            type,
            status,
            form_template_id,
            review_template_id,
            review_schedule_id,
            submitted_at,
            raw_payload,
            form_templates (
                id,
                title,
                type,
                schema
            ),
            review_template:review_templates (
                id,
                coach_id,
                name,
                description,
                review_type,
                form_template_id,
                default_frequency_days,
                include_body_metrics,
                include_performance_metrics,
                include_general_metrics,
                include_progress_photos,
                photos_required,
                photos_max_items,
                is_active,
                created_at,
                updated_at
            )
        `)
        .eq('id', checkinId)
        .single()

    if (checkinErr || !checkin) {
        return <ErrorCard
            icon={<AlertCircle className="h-8 w-8 text-destructive" />}
            title="Formulario no encontrado"
            message="El enlace no es válido o el formulario ha sido eliminado."
        />
    }

    // 3. Verify ownership
    const { data: client } = await admin
        .from('clients')
        .select('auth_user_id, user_id')
        .eq('id', checkin.client_id)
        .single()

    if (!client || (client.auth_user_id !== user.id && client.user_id !== user.id)) {
        return <ErrorCard
            icon={<Lock className="h-8 w-8 text-destructive" />}
            title="Acceso denegado"
            message="No tienes permiso para acceder a este formulario."
        />
    }

    // 4. Form template (puede ser null si la review_template no tiene formulario asociado)
    const formTemplate = checkin.form_templates as unknown as {
        id: string
        title: string
        type: string
        schema: FormField[]
    } | null

    const reviewTemplate = checkin.review_template as unknown as ReviewTemplate | null

    // 5. Cargar TODAS las métricas activas del coach
    const { data: allMetricsData } = await admin
        .from('metric_definitions')
        .select('*')
        .eq('coach_id', checkin.coach_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

    const allMetrics = (allMetricsData ?? []) as MetricDefinition[]

    // 6. Filtrar métricas según review_template (si existe)
    let filteredMetrics: MetricDefinition[]
    let photoConfig: { enabled: boolean; required: boolean; maxItems: number } | null

    if (reviewTemplate) {
        // Nivel 2: selección explícita
        const { data: explicitMetrics } = await admin
            .from('review_template_metrics')
            .select('metric_id')
            .eq('review_template_id', reviewTemplate.id)

        if (explicitMetrics && explicitMetrics.length > 0) {
            const allowed = new Set(explicitMetrics.map(r => r.metric_id))
            filteredMetrics = allMetrics.filter(m => allowed.has(m.id))
        } else {
            // Nivel 1: por grupos
            filteredMetrics = allMetrics.filter(m => {
                const cat = m.category as MetricCategory
                if (cat === 'body' && reviewTemplate.include_body_metrics) return true
                if (cat === 'performance' && reviewTemplate.include_performance_metrics) return true
                if (cat === 'general' && reviewTemplate.include_general_metrics) return true
                return false
            })
        }

        photoConfig = {
            enabled: reviewTemplate.include_progress_photos,
            required: reviewTemplate.photos_required,
            maxItems: reviewTemplate.photos_max_items,
        }
    } else {
        // Legacy: todas las métricas + bloque de fotos según schema
        filteredMetrics = allMetrics
        photoConfig = null
    }

    // 7. Validar que haya algo que mostrar
    const hasFormFields = formTemplate?.schema && formTemplate.schema.filter(f => f.type !== 'photo_upload').length > 0
    const hasMetrics = filteredMetrics.length > 0
    const hasPhotos = photoConfig
        ? photoConfig.enabled
        : (formTemplate?.schema?.some(f => f.type === 'photo_upload') ?? false)

    if (!hasFormFields && !hasMetrics && !hasPhotos) {
        return <ErrorCard
            icon={<AlertCircle className="h-8 w-8 text-destructive" />}
            title="Revisión vacía"
            message="Esta revisión no tiene contenido configurado. Contacta con tu entrenador."
        />
    }

    // 8. Resolver título y schema. Si no hay form_template, usamos un schema vacío y el nombre de la plantilla de revisión.
    const title = formTemplate?.title ?? reviewTemplate?.name ?? 'Revisión'
    const type = formTemplate?.type ?? 'checkin'
    const schema: FormField[] = formTemplate?.schema ?? []

    return (
        <div className="min-h-screen bg-background">
            <div className="container max-w-2xl py-8 px-4">
                <DynamicForm
                    checkinId={checkin.id}
                    templateTitle={title}
                    templateType={type}
                    schema={schema}
                    coachId={checkin.coach_id}
                    clientId={checkin.client_id}
                    metrics={filteredMetrics}
                    initialValues={(checkin.raw_payload as Record<string, unknown>) ?? {}}
                    photoConfig={photoConfig}
                />
            </div>
        </div>
    )
}

function ErrorCard({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-md p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                    {icon}
                </div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="text-muted-foreground text-sm">{message}</p>
            </Card>
        </div>
    )
}
