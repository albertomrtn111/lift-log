import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DynamicForm } from '@/components/forms/DynamicForm'
import { Card } from '@/components/ui/card'
import { AlertCircle, Lock } from 'lucide-react'
import type { FormField } from '@/types/forms'

interface PageProps {
    params: Promise<{ checkinId: string }>
}

export default async function FormPage({ params }: PageProps) {
    const { checkinId } = await params
    const supabase = await createClient()

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect(`/login?redirect=/forms/${checkinId}`)
    }

    // 2. Load checkin + template
    const { data: checkin, error: checkinErr } = await supabase
        .from('checkins')
        .select(`
            id,
            coach_id,
            client_id,
            type,
            status,
            form_template_id,
            submitted_at,
            form_templates (
                id,
                title,
                type,
                schema
            )
        `)
        .eq('id', checkinId)
        .single()

    if (checkinErr || !checkin) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h2 className="text-xl font-semibold">Formulario no encontrado</h2>
                    <p className="text-muted-foreground text-sm">
                        El enlace no es válido o el formulario ha sido eliminado.
                    </p>
                </Card>
            </div>
        )
    }

    // 3. Verify ownership — client's auth_user_id must match current user
    const { data: client } = await supabase
        .from('clients')
        .select('auth_user_id')
        .eq('id', checkin.client_id)
        .single()

    if (!client || client.auth_user_id !== user.id) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                        <Lock className="h-8 w-8 text-destructive" />
                    </div>
                    <h2 className="text-xl font-semibold">Acceso denegado</h2>
                    <p className="text-muted-foreground text-sm">
                        No tienes permiso para acceder a este formulario.
                    </p>
                </Card>
            </div>
        )
    }

    // 4. Already submitted?
    if (checkin.status !== 'pending') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-success" />
                    </div>
                    <h2 className="text-xl font-semibold">Formulario ya enviado</h2>
                    <p className="text-muted-foreground text-sm">
                        Este formulario fue completado el{' '}
                        {checkin.submitted_at
                            ? new Date(checkin.submitted_at).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                            })
                            : 'anteriormente'}
                        .
                    </p>
                </Card>
            </div>
        )
    }

    // 5. Get template data
    const template = checkin.form_templates as unknown as {
        id: string
        title: string
        type: string
        schema: FormField[]
    } | null

    if (!template || !template.schema?.length) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h2 className="text-xl font-semibold">Formulario vacío</h2>
                    <p className="text-muted-foreground text-sm">
                        La plantilla no tiene campos configurados. Contacta con tu entrenador.
                    </p>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container max-w-2xl py-8 px-4">
                <DynamicForm
                    checkinId={checkin.id}
                    templateTitle={template.title}
                    templateType={template.type}
                    schema={template.schema}
                    coachId={checkin.coach_id}
                    clientId={checkin.client_id}
                />
            </div>
        </div>
    )
}
