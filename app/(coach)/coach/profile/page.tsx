import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfile } from '@/data/coach-ai-profile'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    User,
    Mail,
    Calendar,
    Users,
    Brain,
    Dumbbell,
    Apple,
    ClipboardList,
    MessageSquare,
    Sparkles,
    CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { LogoutButton } from '@/components/coach/LogoutButton'
import type { ElementType } from 'react'

export default async function CoachProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)

    const [
        { data: coach },
        { data: membership },
        { count: clientCount },
        aiProfile,
    ] = await Promise.all([
        supabase.from('coaches').select('*').eq('id', coachId).single(),
        supabase.from('coach_memberships').select('role, status').eq('user_id', user.id).eq('status', 'active').single(),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'active'),
        getCoachAIProfile(coachId ?? ''),
    ])

    const isApproved = aiProfile?.profile_status === 'approved'

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Mi Perfil</h1>
                            <p className="text-sm text-muted-foreground">Configuración de cuenta</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6 space-y-6">
                <Card className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-2xl font-bold text-white">
                            {coach?.business_name?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || 'C'}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-semibold">{coach?.business_name || 'Coach'}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{user.email}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                                    {membership?.role === 'owner' ? 'Propietario' : 'Coach'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4 text-center">
                        <Users className="h-6 w-6 text-primary mx-auto mb-2" />
                        <span className="text-2xl font-bold">{clientCount || 0}</span>
                        <span className="text-xs text-muted-foreground block">Clientes activos</span>
                    </Card>
                    <Card className="p-4 text-center">
                        <Calendar className="h-6 w-6 text-success mx-auto mb-2" />
                        <span className="text-sm font-medium">
                            {new Date(user.created_at || '').toLocaleDateString('es-ES', {
                                year: 'numeric',
                                month: 'short',
                            })}
                        </span>
                        <span className="text-xs text-muted-foreground block">Miembro desde</span>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                            Perfil IA del coach
                                        </span>
                                        {isApproved ? (
                                            <Badge className="border-0 bg-emerald-500/10 text-emerald-600">
                                                Activo
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">
                                                Pendiente
                                            </Badge>
                                        )}
                                        {isApproved && aiProfile?.approved_at && (
                                            <Badge variant="outline" className="border-border text-muted-foreground">
                                                Aprobado {new Date(aiProfile.approved_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </Badge>
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold tracking-tight">Tu capa base de personalización para las funciones IA</h2>
                                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground max-w-2xl">
                                            Esta configuración resume tu metodología, tu criterio y tu estilo para que la IA responda y proponga como una extensión real del coach.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Link
                                href={isApproved ? '/coach/ai-onboarding?reconfigure=1' : '/coach/ai-onboarding'}
                                className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted shrink-0"
                            >
                                {isApproved ? 'Reconfigurar' : 'Configurar'}
                            </Link>
                        </div>
                    </Card>

                    {!aiProfile || !isApproved ? (
                        <Card className="rounded-2xl border border-dashed border-border bg-card p-5 shadow-sm">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <Brain className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm text-foreground">Perfil IA no configurado</p>
                                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xl">
                                        Completa el onboarding para que la IA aprenda tu metodología y trabaje con tus criterios, prioridades y estilo de comunicación.
                                    </p>
                                    <Link
                                        href="/coach/ai-onboarding"
                                        className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary hover:underline"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        Comenzar configuración
                                    </Link>
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="font-medium">Perfil IA activo y aprobado</span>
                            </div>

                            {aiProfile.generated_profile_summary && (
                                <AIProfileCard
                                    icon={Brain}
                                    title="Resumen del coach"
                                    description={aiProfile.generated_profile_summary}
                                />
                            )}

                            {aiProfile.generated_methodology && (
                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { icon: Dumbbell, title: 'Entrenamiento', text: aiProfile.generated_methodology.training },
                                        { icon: Apple, title: 'Nutrición', text: aiProfile.generated_methodology.nutrition },
                                        { icon: ClipboardList, title: 'Revisiones', text: aiProfile.generated_methodology.reviews },
                                    ].map(({ icon, title, text }) => (
                                        <AIProfileCard
                                            key={title}
                                            icon={icon}
                                            title={title}
                                            description={text}
                                        />
                                    ))}
                                </div>
                            )}

                            {aiProfile.generated_communication_style && (
                                <AIProfileCard
                                    icon={MessageSquare}
                                    title="Estilo de comunicación"
                                    description={aiProfile.generated_communication_style}
                                />
                            )}

                            {aiProfile.generated_master_rules && (
                                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                                    <div className="mb-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                            Reglas maestras
                                        </p>
                                        <h3 className="mt-2 text-base font-semibold tracking-tight text-foreground">
                                            Criterios que la IA debe respetar siempre
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <RulesColumn
                                            title="Siempre hacer"
                                            tone="positive"
                                            items={aiProfile.generated_master_rules.always_do || []}
                                        />
                                        <RulesColumn
                                            title="Nunca hacer"
                                            tone="negative"
                                            items={aiProfile.generated_master_rules.never_do || []}
                                        />
                                        <RulesColumn
                                            title="Criterios clave"
                                            tone="neutral"
                                            items={aiProfile.generated_master_rules.decision_criteria || []}
                                        />
                                    </div>
                                </Card>
                            )}

                            {aiProfile.specialty && aiProfile.specialty.length > 0 && (
                                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                                    <div className="mb-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                            Especialidades destacadas
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Etiquetas base que ayudan a contextualizar mejor las respuestas de la IA.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {aiProfile.specialty.map(s => (
                                            <Badge
                                                key={s}
                                                variant="secondary"
                                                className="rounded-full border-0 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                                            >
                                                {s}
                                            </Badge>
                                        ))}
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}
                </div>

                <Card className="divide-y">
                    <Link
                        href="/coach/members"
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <span>Gestionar miembros</span>
                        </div>
                        <span className="text-muted-foreground">→</span>
                    </Link>
                    <Link
                        href="/planning"
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <span>Ver como cliente</span>
                        </div>
                        <span className="text-muted-foreground">→</span>
                    </Link>
                </Card>

                <Card className="p-4">
                    <LogoutButton />
                </Card>
            </div>
        </div>
    )
}

function AIProfileCard({
    icon: Icon,
    title,
    description,
}: {
    icon: ElementType
    title: string
    description: string
}) {
    return (
        <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        {title}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-foreground">
                        {description}
                    </p>
                </div>
            </div>
        </Card>
    )
}

function RulesColumn({
    title,
    items,
    tone,
}: {
    title: string
    items: string[]
    tone: 'positive' | 'negative' | 'neutral'
}) {
    const toneClasses = {
        positive: {
            heading: 'text-emerald-700',
            dot: 'bg-emerald-500',
            surface: 'bg-emerald-50/60',
        },
        negative: {
            heading: 'text-rose-700',
            dot: 'bg-rose-500',
            surface: 'bg-rose-50/60',
        },
        neutral: {
            heading: 'text-primary',
            dot: 'bg-primary',
            surface: 'bg-primary/5',
        },
    }[tone]

    return (
        <div className={`rounded-xl border border-border p-4 ${toneClasses.surface}`}>
            <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${toneClasses.heading}`}>
                {title}
            </p>
            <ul className="mt-3 space-y-3">
                {items.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm leading-6 text-foreground">
                        <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses.dot}`} />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
