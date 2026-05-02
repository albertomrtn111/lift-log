import Link from 'next/link'
import type { ElementType } from 'react'
import {
    Apple,
    Brain,
    Calendar,
    CheckCircle2,
    ClipboardList,
    Dumbbell,
    Headphones,
    Mail,
    MessageSquare,
    Paintbrush,
    Settings2,
    Sparkles,
    User,
    Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfile } from '@/data/coach-ai-profile'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { LogoutButton } from '@/components/coach/LogoutButton'
import { AppearanceSettingsPanel, SupportSettingsPanel } from '@/components/coach/settings/SettingsClientPanels'
import { cn } from '@/lib/utils'

type SettingsTab = 'perfil' | 'apariencia' | 'soporte'

interface CoachSettingsPageProps {
    searchParams: Promise<{ tab?: string }>
}

const SETTINGS_TABS: Array<{
    id: SettingsTab
    label: string
    description: string
    icon: ElementType
}> = [
    {
        id: 'perfil',
        label: 'Perfil',
        description: 'Cuenta, atletas y perfil IA',
        icon: User,
    },
    {
        id: 'apariencia',
        label: 'Apariencia',
        description: 'Tema claro u oscuro',
        icon: Paintbrush,
    },
    {
        id: 'soporte',
        label: 'Soporte',
        description: 'Ayuda e incidencias',
        icon: Headphones,
    },
]

export default async function CoachSettingsPage({ searchParams }: CoachSettingsPageProps) {
    const params = await searchParams
    const activeTab = parseSettingsTab(params.tab)
    const profileData = await getSettingsProfileData()

    return (
        <div className="min-h-screen bg-background px-4 py-8 pb-24 sm:px-6 lg:px-8 lg:pb-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
                <header className="space-y-3">
                    <Badge variant="outline" className="w-fit">
                        Configuración
                    </Badge>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                                Ajustes
                            </h1>
                            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                                Gestiona tu perfil, la apariencia de la app y los accesos de soporte desde un único sitio.
                            </p>
                        </div>
                    </div>
                </header>

                <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                    <aside className="rounded-2xl border border-border bg-card p-2 shadow-sm">
                        <nav className="space-y-1">
                            {SETTINGS_TABS.map((item) => {
                                const Icon = item.icon
                                const isActive = activeTab === item.id

                                return (
                                    <Link
                                        key={item.id}
                                        href={`/coach/settings?tab=${item.id}`}
                                        prefetch={true}
                                        className={cn(
                                            'group flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                                            'hover:bg-muted/60',
                                            isActive && 'bg-primary/10 text-primary'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground',
                                                isActive && 'bg-primary text-primary-foreground'
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2 text-sm font-semibold">
                                                <span
                                                    className={cn(
                                                        'h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40',
                                                        isActive && 'bg-primary'
                                                    )}
                                                />
                                                {item.label}
                                            </span>
                                            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                                                {item.description}
                                            </span>
                                        </span>
                                    </Link>
                                )
                            })}
                        </nav>
                    </aside>

                    <main className="min-w-0">
                        {activeTab === 'perfil' && <ProfileSettingsSection {...profileData} />}
                        {activeTab === 'apariencia' && <AppearanceSettingsPanel />}
                        {activeTab === 'soporte' && <SupportSettingsPanel />}
                    </main>
                </div>
            </div>
        </div>
    )
}

async function getSettingsProfileData() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return {
            user: null,
            coach: null,
            membership: null,
            clientCount: 0,
            aiProfile: null,
        }
    }

    const coachId = await getCoachIdForUser(user.id)

    const [
        { data: coach },
        { data: membership },
        { count: clientCount },
        aiProfile,
    ] = await Promise.all([
        coachId
            ? supabase.from('coaches').select('*').eq('id', coachId).single()
            : Promise.resolve({ data: null }),
        supabase.from('coach_memberships').select('role, status').eq('user_id', user.id).eq('status', 'active').single(),
        coachId
            ? supabase.from('clients').select('*', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'active')
            : Promise.resolve({ count: 0 }),
        coachId ? getCoachAIProfile(coachId) : Promise.resolve(null),
    ])

    return {
        user,
        coach,
        membership,
        clientCount: clientCount || 0,
        aiProfile,
    }
}

function parseSettingsTab(tab?: string): SettingsTab {
    if (tab === 'apariencia' || tab === 'soporte' || tab === 'perfil') return tab
    return 'perfil'
}

function ProfileSettingsSection({
    user,
    coach,
    membership,
    clientCount,
    aiProfile,
}: Awaited<ReturnType<typeof getSettingsProfileData>>) {
    if (!user) return null

    const isApproved = aiProfile?.profile_status === 'approved'
    const coachName = coach?.business_name || 'Coach'
    const coachInitial = coachName.charAt(0) || user.email?.charAt(0)?.toUpperCase() || 'C'

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-2xl font-bold text-white">
                        {coachInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">{coachName}</h2>
                                <div className="mt-1 flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span className="break-all text-sm text-muted-foreground">{user.email}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary" className="border-0 bg-primary/10 text-primary">
                                        {membership?.role === 'owner' ? 'Propietario' : 'Coach'}
                                    </Badge>
                                    {membership?.status && (
                                        <Badge variant="outline" className="text-muted-foreground">
                                            {membership.status === 'active' ? 'Activo' : membership.status}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <AIActionButton asChild>
                                <Link href={isApproved ? '/coach/ai-onboarding?reconfigure=1' : '/coach/ai-onboarding'}>
                                    {isApproved ? 'Reconfigurar IA' : 'Configurar IA'}
                                </Link>
                            </AIActionButton>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-4 text-center">
                    <Users className="mx-auto mb-2 h-6 w-6 text-primary" />
                    <span className="text-2xl font-bold">{clientCount}</span>
                    <span className="block text-xs text-muted-foreground">Clientes activos</span>
                </Card>
                <Card className="p-4 text-center">
                    <Calendar className="mx-auto mb-2 h-6 w-6 text-success" />
                    <span className="text-sm font-medium">
                        {new Date(user.created_at || '').toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                        })}
                    </span>
                    <span className="block text-xs text-muted-foreground">Miembro desde</span>
                </Card>
            </div>

            <div className="space-y-4">
                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
                                    <h2 className="text-lg font-semibold tracking-tight">
                                        Tu capa base de personalización para las funciones IA
                                    </h2>
                                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                        Esta configuración resume tu metodología, tu criterio y tu estilo para que la IA responda y proponga como una extensión real del coach.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {!aiProfile || !isApproved ? (
                    <Card className="rounded-2xl border border-dashed border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                <Brain className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">Perfil IA no configurado</p>
                                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                                    Completa el onboarding para que la IA aprenda tu metodología y trabaje con tus criterios, prioridades y estilo de comunicación.
                                </p>
                                <Link
                                    href="/coach/ai-onboarding"
                                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
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
                                    {aiProfile.specialty.map((specialty) => (
                                        <Badge
                                            key={specialty}
                                            variant="secondary"
                                            className="rounded-full border-0 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                                        >
                                            {specialty}
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
                    className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
                >
                    <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <span>Gestionar atletas</span>
                    </div>
                    <span className="text-muted-foreground">-&gt;</span>
                </Link>
                <Link
                    href="/planning"
                    className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
                >
                    <div className="flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-muted-foreground" />
                        <span>Ver como cliente</span>
                    </div>
                    <span className="text-muted-foreground">-&gt;</span>
                </Link>
            </Card>

            <Card className="p-4">
                <LogoutButton />
            </Card>
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
