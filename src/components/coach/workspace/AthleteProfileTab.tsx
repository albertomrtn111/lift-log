'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    AlertCircle,
    Brain,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Dumbbell,
    HeartPulse,
    Loader2,
    Pencil,
    Plus,
    Sparkles,
    Target,
    Trash2,
    UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
    ATHLETE_PROFILE_INITIAL_ANSWERS,
    type AthleteAIProfile,
    type AthleteAIProfileOutput,
    type AthleteAnnualGoal,
    type AthleteProfileAnswers,
} from '@/types/athlete-profile'
import {
    approveAthleteProfile,
    saveAthleteProfileStep,
    updateGeneratedAthleteProfileSections,
} from './athlete-profile-actions'
import { importOnboardingToAthleteProfile } from './import-onboarding-action'

type ViewMode = 'empty' | 'wizard' | 'review' | 'approved' | 'generating'

interface AthleteProfileTabProps {
    clientId: string
    clientName: string
    athleteProfile: AthleteAIProfile | null
}

const STEP_CONFIG = [
    { title: 'Identidad', subtitle: 'Perfil y contexto actual', icon: UserRound },
    { title: 'Objetivos', subtitle: 'Año e hitos con fecha', icon: Target },
    { title: 'Salud', subtitle: 'Limitaciones y vigilancia', icon: HeartPulse },
    { title: 'Entrenamiento', subtitle: 'Hábitos y disponibilidad', icon: Dumbbell },
    { title: 'Nutrición', subtitle: 'Composición y recuperación', icon: Brain },
    { title: 'Resumen', subtitle: 'Revisa y genera el perfil', icon: Sparkles },
] as const

const DISCIPLINE_OPTIONS = [
    'Fuerza',
    'Hipertrofia',
    'Running',
    'Trail running',
    'Híbrido',
    'Hyrox',
    'Pérdida de grasa',
    'Recomposición corporal',
    'Resistencia',
    'Salud general',
    'Readaptación',
]

const LEVEL_OPTIONS = ['Principiante', 'Intermedio', 'Avanzado', 'Competición']

const GOAL_PRIORITY_OPTIONS: AthleteAnnualGoal['priority'][] = ['principal', 'secundario']

function createEmptyGoal(): AthleteAnnualGoal {
    return {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `goal-${Date.now()}`,
        title: '',
        targetDate: '',
        priority: 'secundario',
    }
}

function normalizeAnswers(answers?: AthleteProfileAnswers | null): AthleteProfileAnswers {
    return {
        ...ATHLETE_PROFILE_INITIAL_ANSWERS,
        ...(answers ?? {}),
        athleteDisciplines: Array.isArray(answers?.athleteDisciplines) ? answers!.athleteDisciplines : [],
        annualGoals: Array.isArray(answers?.annualGoals)
            ? answers!.annualGoals.map(goal => ({
                id: goal.id || createEmptyGoal().id,
                title: goal.title || '',
                targetDate: goal.targetDate || '',
                priority: goal.priority === 'principal' ? 'principal' : 'secundario',
            }))
            : [],
    }
}

function getGeneratedProfile(profile: AthleteAIProfile | null): AthleteAIProfileOutput | null {
    if (!profile) return null
    if (profile.generated_profile_json) return profile.generated_profile_json

    if (
        profile.generated_athlete_summary &&
        profile.generated_goals_and_calendar &&
        profile.generated_health_and_constraints &&
        profile.generated_training_profile &&
        profile.generated_nutrition_and_body_context &&
        profile.generated_key_points_and_working_rules &&
        profile.generated_system_prompt
    ) {
        return {
            athlete_summary: profile.generated_athlete_summary,
            goals_and_calendar: profile.generated_goals_and_calendar,
            health_and_constraints: profile.generated_health_and_constraints,
            training_profile: profile.generated_training_profile,
            nutrition_and_body_context: profile.generated_nutrition_and_body_context,
            key_points_and_working_rules: profile.generated_key_points_and_working_rules,
            system_prompt: profile.generated_system_prompt,
        }
    }

    return null
}

function getInitialMode(profile: AthleteAIProfile | null): ViewMode {
    if (!profile) return 'empty'
    if (profile.profile_status === 'generating') return 'generating'
    if (profile.profile_status === 'generated') return 'review'
    if (profile.profile_status === 'approved') return 'approved'

    const hasAnswers = Object.values(normalizeAnswers(profile.answers_json)).some(value => {
        if (Array.isArray(value)) return value.length > 0
        return typeof value === 'string' ? value.trim().length > 0 : false
    })

    return hasAnswers ? 'wizard' : 'empty'
}

function formatGoalDate(date: string) {
    if (!date) return 'Sin fecha'

    const parsed = new Date(`${date}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) return date

    return format(parsed, "d MMM yyyy", { locale: es })
}

function QuestionBlock({
    label,
    hint,
    children,
}: {
    label: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2.5">
            <div className="space-y-1">
                <Label className="text-[14px] font-semibold text-foreground leading-snug">
                    {label}
                </Label>
                {hint && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{hint}</p>
                )}
            </div>
            {children}
        </div>
    )
}

function StyledTextarea({
    value,
    onChange,
    placeholder,
    rows = 3,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    rows?: number
}) {
    return (
        <Textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary/30 text-sm leading-relaxed rounded-lg"
        />
    )
}

function ChipSelect({
    options,
    value,
    onChange,
    multiple = true,
}: {
    options: string[]
    value: string[]
    onChange: (v: string[]) => void
    multiple?: boolean
}) {
    const toggle = (opt: string) => {
        if (multiple) {
            onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
        } else {
            onChange(value.includes(opt) ? [] : [opt])
        }
    }

    return (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => {
                const selected = value.includes(opt)
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => toggle(opt)}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150',
                            selected
                                ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                                : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5',
                        )}
                    >
                        {selected && <Check className="h-3 w-3 shrink-0" />}
                        {opt}
                    </button>
                )
            })}
        </div>
    )
}

function Stepper({ current }: { current: number }) {
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {STEP_CONFIG.map((step, index) => {
                const isActive = current === index + 1
                const isDone = current > index + 1
                const Icon = step.icon

                return (
                    <div
                        key={step.title}
                        className={cn(
                            'rounded-xl border px-3 py-3 transition-colors',
                            isActive && 'border-primary/40 bg-primary/5',
                            isDone && 'border-emerald-500/20 bg-emerald-500/5',
                            !isActive && !isDone && 'border-border bg-card',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <div
                                className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-lg',
                                    isActive && 'bg-primary/10 text-primary',
                                    isDone && 'bg-emerald-500/10 text-emerald-600',
                                    !isActive && !isDone && 'bg-muted text-muted-foreground',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{step.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{step.subtitle}</p>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function GoalsEditor({
    goals,
    onChange,
}: {
    goals: AthleteAnnualGoal[]
    onChange: (goals: AthleteAnnualGoal[]) => void
}) {
    const updateGoal = (goalId: string, patch: Partial<AthleteAnnualGoal>) => {
        onChange(
            goals.map(goal => (goal.id === goalId ? { ...goal, ...patch } : goal))
        )
    }

    return (
        <div className="space-y-3">
            {goals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Todavía no has añadido hitos con fecha. Puedes dejarlo vacío o añadir los más importantes del año.
                </div>
            ) : (
                goals.map(goal => (
                    <Card key={goal.id} className="p-4 border-border shadow-sm">
                        <div className="grid gap-3 md:grid-cols-[1.4fr_180px_auto] md:items-end">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Objetivo / hito
                                </Label>
                                <Input
                                    value={goal.title}
                                    onChange={e => updateGoal(goal.id, { title: e.target.value })}
                                    placeholder="Ej: Media maratón sub 1h35"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Fecha objetivo
                                </Label>
                                <Input
                                    type="date"
                                    value={goal.targetDate}
                                    onChange={e => updateGoal(goal.id, { targetDate: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-2 justify-between md:justify-end">
                                <div className="flex rounded-lg border border-border p-1">
                                    {GOAL_PRIORITY_OPTIONS.map(priority => (
                                        <button
                                            key={priority}
                                            type="button"
                                            onClick={() => updateGoal(goal.id, { priority })}
                                            className={cn(
                                                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                                                goal.priority === priority
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {priority}
                                        </button>
                                    ))}
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onChange(goals.filter(current => current.id !== goal.id))}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))
            )}

            <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => onChange([...goals, createEmptyGoal()])}
            >
                <Plus className="h-4 w-4" />
                Añadir objetivo con fecha
            </Button>
        </div>
    )
}

function ReviewRows({ form }: { form: AthleteProfileAnswers }) {
    const rows = [
        { label: 'Disciplinas', value: form.athleteDisciplines.join(', ') || '—' },
        { label: 'Nivel', value: form.athleteLevel || '—' },
        { label: 'Situación actual', value: form.currentSituation || '—' },
        { label: 'Objetivo principal', value: form.primaryAnnualGoal || '—' },
        { label: 'Hitos fechados', value: form.annualGoals.length ? `${form.annualGoals.length} hitos` : 'Sin hitos' },
        { label: 'Disponibilidad', value: form.weeklyAvailability || '—' },
        { label: 'Contexto nutricional', value: form.nutritionContext || '—' },
    ]

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-border overflow-hidden">
                {rows.map((row, i) => (
                    <div
                        key={row.label}
                        className={cn(
                            'flex gap-4 px-4 py-3 text-sm',
                            i % 2 === 0 ? 'bg-background' : 'bg-muted/40',
                        )}
                    >
                        <span className="text-muted-foreground w-40 shrink-0 font-medium">{row.label}</span>
                        <span className="text-foreground line-clamp-3">{row.value}</span>
                    </div>
                ))}
            </div>

            {form.annualGoals.length > 0 && (
                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                            Objetivos anuales con fecha
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Estos hitos se usarán como contexto explícito en la generación del perfil.
                        </p>
                    </div>
                    <div className="space-y-2">
                        {form.annualGoals.map(goal => (
                            <div key={goal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
                                <div>
                                    <p className="text-sm font-medium text-foreground">{goal.title || 'Objetivo sin título'}</p>
                                    <p className="text-xs text-muted-foreground">{formatGoalDate(goal.targetDate)}</p>
                                </div>
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        'capitalize border-0',
                                        goal.priority === 'principal'
                                            ? 'bg-primary/10 text-primary'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {goal.priority}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    )
}

function ProfileSectionCard({
    title,
    description,
    content,
    editable = false,
    value,
    onChange,
}: {
    title: string
    description?: string
    content?: string
    editable?: boolean
    value?: string
    onChange?: (value: string) => void
}) {
    return (
        <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="space-y-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        {title}
                    </p>
                    {description && (
                        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                    )}
                </div>
                {editable ? (
                    <Textarea
                        value={value}
                        onChange={event => onChange?.(event.target.value)}
                        rows={6}
                        className="resize-none bg-background border-border text-sm leading-relaxed"
                    />
                ) : (
                    <p className="text-sm leading-7 text-foreground whitespace-pre-line">
                        {content}
                    </p>
                )}
            </div>
        </Card>
    )
}

export function AthleteProfileTab({
    clientId,
    clientName,
    athleteProfile,
}: AthleteProfileTabProps) {
    const router = useRouter()
    const { toast } = useToast()
    const persistedGeneratedProfile = useMemo(() => getGeneratedProfile(athleteProfile), [athleteProfile])
    const [mode, setMode] = useState<ViewMode>(getInitialMode(athleteProfile))
    const [step, setStep] = useState(1)
    const [form, setForm] = useState<AthleteProfileAnswers>(() => normalizeAnswers(athleteProfile?.answers_json))
    const [generatedProfile, setGeneratedProfile] = useState<AthleteAIProfileOutput | null>(persistedGeneratedProfile)
    const [isSavingStep, setIsSavingStep] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [isEditingGenerated, setIsEditingGenerated] = useState(false)
    const [isSavingGeneratedEdit, setIsSavingGeneratedEdit] = useState(false)
    const [generatedDraft, setGeneratedDraft] = useState<AthleteAIProfileOutput | null>(persistedGeneratedProfile)
    const [error, setError] = useState<string | null>(athleteProfile?.generation_error || null)
    const [isImportingOnboarding, setIsImportingOnboarding] = useState(false)

    const handleImportOnboarding = async () => {
        setIsImportingOnboarding(true)
        setError(null)

        try {
            const result = await importOnboardingToAthleteProfile(clientId, clientName)

            if (!result.success) {
                if (result.noOnboarding) {
                    toast({
                        title: 'Sin formulario de onboarding',
                        description: result.error,
                        variant: 'destructive',
                    })
                } else {
                    setError(result.error || 'Error desconocido')
                    toast({
                        title: 'Error al generar el perfil',
                        description: result.error,
                        variant: 'destructive',
                    })
                }
                return
            }

            if (result.output) {
                setGeneratedProfile(result.output)
                setGeneratedDraft(result.output)
            }
            setMode('review')
            toast({
                title: 'Perfil generado desde onboarding',
                description: `Revisa el perfil de ${clientName} y apruébalo cuando esté listo.`,
            })
            router.refresh()
        } finally {
            setIsImportingOnboarding(false)
        }
    }

    const startWizard = () => {
        setForm(normalizeAnswers(athleteProfile?.answers_json))
        setError(null)
        setStep(1)
        setMode('wizard')
    }

    const saveCurrentStep = async () => {
        setIsSavingStep(true)
        const result = await saveAthleteProfileStep(clientId, form)
        setIsSavingStep(false)

        if (!result.success) {
            toast({
                title: 'No se pudo guardar',
                description: result.error || 'Error desconocido',
                variant: 'destructive',
            })
            return false
        }

        return true
    }

    const goNext = async () => {
        const success = await saveCurrentStep()
        if (!success) return
        setStep(prev => Math.min(prev + 1, STEP_CONFIG.length))
    }

    const handleGenerate = async () => {
        const success = await saveCurrentStep()
        if (!success) return

        setIsGenerating(true)
        setError(null)

        try {
            const response = await fetch('/api/ai/generate-athlete-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId }),
            })

            const payload = await response.json()
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'No se pudo generar el perfil del atleta.')
            }

            setGeneratedProfile(payload.output as AthleteAIProfileOutput)
            setGeneratedDraft(payload.output as AthleteAIProfileOutput)
            setMode('review')

            toast({
                title: 'Perfil generado',
                description: `Ya puedes revisar y aprobar el perfil de ${clientName}.`,
            })
            router.refresh()
        } catch (generationError) {
            const message = generationError instanceof Error ? generationError.message : 'Error desconocido'
            setError(message)
            toast({
                title: 'Error al generar el perfil',
                description: message,
                variant: 'destructive',
            })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleApprove = async () => {
        setIsApproving(true)
        const result = await approveAthleteProfile(clientId)
        setIsApproving(false)

        if (!result.success) {
            toast({
                title: 'No se pudo aprobar',
                description: result.error || 'Error desconocido',
                variant: 'destructive',
            })
            return
        }

        setMode('approved')
        toast({
            title: 'Perfil del atleta aprobado',
            description: 'El perfil ha quedado guardado como versión activa.',
        })
        router.refresh()
    }

    const handleSaveGeneratedEdit = async () => {
        if (!generatedDraft) return

        setIsSavingGeneratedEdit(true)
        const result = await updateGeneratedAthleteProfileSections(clientId, {
            athlete_summary: generatedDraft.athlete_summary,
            goals_and_calendar: generatedDraft.goals_and_calendar,
            health_and_constraints: generatedDraft.health_and_constraints,
            training_profile: generatedDraft.training_profile,
            nutrition_and_body_context: generatedDraft.nutrition_and_body_context,
            key_points_and_working_rules: generatedDraft.key_points_and_working_rules,
        })
        setIsSavingGeneratedEdit(false)

        if (!result.success) {
            toast({
                title: 'No se pudo guardar',
                description: result.error || 'Error desconocido',
                variant: 'destructive',
            })
            return
        }

        setGeneratedProfile(generatedDraft)
        setIsEditingGenerated(false)
        toast({
            title: 'Perfil actualizado',
            description: 'Los cambios manuales se han guardado correctamente.',
        })
        router.refresh()
    }

    const profileToRender = generatedDraft ?? generatedProfile ?? persistedGeneratedProfile

    const sections = profileToRender
        ? [
            {
                key: 'athlete_summary' as const,
                title: 'Resumen del atleta',
                description: 'Lectura rápida del punto de partida y del contexto general.',
                content: profileToRender.athlete_summary,
            },
            {
                key: 'goals_and_calendar' as const,
                title: 'Objetivos y calendario',
                description: 'Meta principal, secundarios y hitos importantes del año.',
                content: profileToRender.goals_and_calendar,
            },
            {
                key: 'health_and_constraints' as const,
                title: 'Contexto físico y salud',
                description: 'Limitaciones, molestias y focos de vigilancia para programar.',
                content: profileToRender.health_and_constraints,
            },
            {
                key: 'training_profile' as const,
                title: 'Perfil de entrenamiento',
                description: 'Fortalezas, debilidades, adherencia y disponibilidad.',
                content: profileToRender.training_profile,
            },
            {
                key: 'nutrition_and_body_context' as const,
                title: 'Nutrición y composición',
                description: 'Objetivo corporal, recuperación y contexto físico relevante.',
                content: profileToRender.nutrition_and_body_context,
            },
            {
                key: 'key_points_and_working_rules' as const,
                title: 'Puntos clave y reglas de trabajo',
                description: 'Notas prácticas que el coach debería tener presentes al trabajar con este atleta.',
                content: profileToRender.key_points_and_working_rules,
            },
        ]
        : []

    if (mode === 'empty') {
        return (
            <div className="space-y-4">
                {/* Option 1: Import from onboarding */}
                <Card className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                    Opción recomendada
                                </p>
                                <h3 className="text-base font-semibold tracking-tight">Generar perfil desde el onboarding</h3>
                                <p className="text-sm leading-relaxed text-muted-foreground max-w-xl">
                                    Si {clientName} ya completó el formulario de onboarding, la IA puede generar el perfil directamente desde sus respuestas sin que tengas que rellenar nada.
                                </p>
                            </div>
                        </div>
                        <AIActionButton
                            onClick={handleImportOnboarding}
                            disabled={isImportingOnboarding}
                            className="shrink-0"
                        >
                            {isImportingOnboarding ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Generando perfil...
                                </>
                            ) : (
                                'Importar desde onboarding'
                            )}
                        </AIActionButton>
                    </div>
                    {error && (
                        <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}
                </Card>

                {/* Option 2: Manual wizard */}
                <Card className="rounded-2xl border border-dashed border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shrink-0">
                                <UserRound className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-base font-semibold tracking-tight">Configurar manualmente</h3>
                                <p className="text-sm leading-relaxed text-muted-foreground max-w-xl">
                                    Rellena el perfil tú mismo con el asistente guiado de 6 pasos. Útil si el atleta no hizo onboarding o quieres añadir contexto más detallado.
                                </p>
                            </div>
                        </div>
                        <Button variant="outline" onClick={startWizard} className="shrink-0">
                            Configurar perfil manualmente
                        </Button>
                    </div>
                </Card>
            </div>
        )
    }

    if (mode === 'generating') {
        return (
            <Card className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                <div className="flex flex-col items-center text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <h3 className="mt-4 text-lg font-semibold">Generando perfil del atleta...</h3>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                        Estamos consolidando el contexto del atleta para crear una versión estructurada y lista para revisión.
                    </p>
                    <Button variant="outline" className="mt-5" onClick={() => router.refresh()}>
                        Actualizar estado
                    </Button>
                </div>
            </Card>
        )
    }

    if (mode === 'wizard') {
        return (
            <div className="space-y-6">
                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                    Perfil del atleta
                                </span>
                                <Badge variant="secondary">Configuración</Badge>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold tracking-tight">Capa de contexto para {clientName}</h3>
                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground max-w-2xl">
                                    Responde como coach. Al final generaremos un perfil estructurado para usarlo como referencia de trabajo y futura personalización IA.
                                </p>
                            </div>
                        </div>
                        {(athleteProfile?.profile_status === 'approved' || athleteProfile?.profile_status === 'generated') && (
                            <Button variant="outline" onClick={() => setMode(athleteProfile.profile_status === 'approved' ? 'approved' : 'review')}>
                                Cancelar reconfiguración
                            </Button>
                        )}
                    </div>
                </Card>

                {error && (
                    <Card className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-destructive">La última generación falló</p>
                                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                            </div>
                        </div>
                    </Card>
                )}

                <Stepper current={step} />

                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    {step === 1 && (
                        <div className="space-y-8">
                            <QuestionBlock
                                label="¿Qué perfil o disciplinas describen mejor a este atleta?"
                                hint="Selecciona las etiquetas que más contexto dan al tipo de atleta y objetivo actual."
                            >
                                <ChipSelect
                                    options={DISCIPLINE_OPTIONS}
                                    value={form.athleteDisciplines}
                                    onChange={value => setForm(current => ({ ...current, athleteDisciplines: value }))}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="¿En qué nivel se encuentra ahora mismo?">
                                <ChipSelect
                                    options={LEVEL_OPTIONS}
                                    value={form.athleteLevel ? [form.athleteLevel] : []}
                                    onChange={value => setForm(current => ({ ...current, athleteLevel: value[0] ?? '' }))}
                                    multiple={false}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Experiencia y contexto del atleta"
                                hint="Años entrenando, historial deportivo y bagaje relevante."
                            >
                                <StyledTextarea
                                    value={form.experienceContext}
                                    onChange={value => setForm(current => ({ ...current, experienceContext: value }))}
                                    placeholder="Ej: Lleva 4 años entrenando fuerza, compaginó running recreativo, ha hecho varias medias maratones y tolera bien bloques de 4-5 días."
                                    rows={4}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Situación actual"
                                hint="Qué está pasando ahora mismo con el atleta: momento de la temporada, objetivo inmediato, fatiga, adherencia..."
                            >
                                <StyledTextarea
                                    value={form.currentSituation}
                                    onChange={value => setForm(current => ({ ...current, currentSituation: value }))}
                                    placeholder="Ej: Viene de 3 semanas de carga alta, quiere priorizar carrera sin perder fuerza y está retomando volumen después de molestias."
                                    rows={4}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Contexto semanal general"
                                hint="Trabajo, familia, agenda, viajes o cualquier condicionante estable que afecte a la planificación."
                            >
                                <StyledTextarea
                                    value={form.weeklyContext}
                                    onChange={value => setForm(current => ({ ...current, weeklyContext: value }))}
                                    placeholder="Ej: Tiene disponibilidad real de lunes a sábado, pero solo 60 min entre semana. Viaja dos jueves al mes y el domingo suele descansar con familia."
                                    rows={3}
                                />
                            </QuestionBlock>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-8">
                            <QuestionBlock
                                label="Objetivo principal del año"
                                hint="El gran norte del atleta para esta temporada."
                            >
                                <StyledTextarea
                                    value={form.primaryAnnualGoal}
                                    onChange={value => setForm(current => ({ ...current, primaryAnnualGoal: value }))}
                                    placeholder="Ej: Completar media maratón sub 1h35 manteniendo dos sesiones de fuerza semanales."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Objetivos secundarios"
                                hint="Todo lo que acompaña al objetivo principal y condiciona decisiones del coach."
                            >
                                <StyledTextarea
                                    value={form.secondaryAnnualGoals}
                                    onChange={value => setForm(current => ({ ...current, secondaryAnnualGoals: value }))}
                                    placeholder="Ej: Mejorar composición corporal, volver a entrenar sin dolor lumbar y mantener adherencia alta durante el verano."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Objetivos / hitos con fecha"
                                hint="Añade pruebas, bloques o metas del año que necesiten una fecha concreta."
                            >
                                <GoalsEditor
                                    goals={form.annualGoals}
                                    onChange={annualGoals => setForm(current => ({ ...current, annualGoals }))}
                                />
                            </QuestionBlock>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-8">
                            <QuestionBlock
                                label="Lesiones previas o historial de salud relevante"
                                hint="Qué antecedentes condicionan la programación aunque ahora esté asintomático."
                            >
                                <StyledTextarea
                                    value={form.injuryHistory}
                                    onChange={value => setForm(current => ({ ...current, injuryHistory: value }))}
                                    placeholder="Ej: Esguince de tobillo recurrente, episodio de tendinopatía rotuliana hace 2 años, antecedente de dolor lumbar."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Molestias o limitaciones actuales"
                                hint="Qué está dando guerra ahora mismo y cómo condiciona el trabajo."
                            >
                                <StyledTextarea
                                    value={form.currentIssues}
                                    onChange={value => setForm(current => ({ ...current, currentIssues: value }))}
                                    placeholder="Ej: Molestia en hombro derecho con press por encima de la cabeza, sensibilidad de sóleo cuando sube demasiado el volumen de carrera."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Restricciones claras"
                                hint="Cosas que no quieres programar, límites médicos o preferencias fuertes."
                            >
                                <StyledTextarea
                                    value={form.restrictions}
                                    onChange={value => setForm(current => ({ ...current, restrictions: value }))}
                                    placeholder="Ej: Evitar impacto dos días seguidos, no tolera sesiones dobles entre semana, no hacer sentadilla trasera pesada."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock
                                label="Puntos a vigilar"
                                hint="Qué señales o indicadores debería tener siempre presentes el coach."
                            >
                                <StyledTextarea
                                    value={form.monitoringPoints}
                                    onChange={value => setForm(current => ({ ...current, monitoringPoints: value }))}
                                    placeholder="Ej: Si baja sueño + sube estrés, ajustar carga. Vigilar dolor de rodilla tras series. Controlar peso si entra en déficit."
                                    rows={3}
                                />
                            </QuestionBlock>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-8">
                            <QuestionBlock label="Fortalezas del atleta">
                                <StyledTextarea
                                    value={form.strengths}
                                    onChange={value => setForm(current => ({ ...current, strengths: value }))}
                                    placeholder="Ej: Muy constante, aprende rápido la técnica, buena capacidad aeróbica base, responde bien a bloques estructurados."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Debilidades o cuellos de botella">
                                <StyledTextarea
                                    value={form.weaknesses}
                                    onChange={value => setForm(current => ({ ...current, weaknesses: value }))}
                                    placeholder="Ej: Baja tolerancia a impacto, mala gestión de intensidad, poca fuerza en tren superior, suele ir pasado de ritmo."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Adherencia y hábitos de cumplimiento">
                                <StyledTextarea
                                    value={form.adherenceProfile}
                                    onChange={value => setForm(current => ({ ...current, adherenceProfile: value }))}
                                    placeholder="Ej: Cumple muy bien si entiende el porqué. Falla más los fines de semana. Necesita recordatorios simples y objetivos realistas."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Disponibilidad semanal real">
                                <StyledTextarea
                                    value={form.weeklyAvailability}
                                    onChange={value => setForm(current => ({ ...current, weeklyAvailability: value }))}
                                    placeholder="Ej: 5 días disponibles, 60 min entre semana, tirada larga el sábado, gimnasio martes y jueves."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Tolerancia a carga e historial de entrenamiento">
                                <StyledTextarea
                                    value={form.loadTolerance}
                                    onChange={value => setForm(current => ({ ...current, loadTolerance: value }))}
                                    placeholder="Ej: Tolera bien 3 sesiones intensas/semana pero se pasa rápido con volúmenes altos de pierna. Mejor progresiones conservadoras."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Historial o contexto de entrenamiento relevante">
                                <StyledTextarea
                                    value={form.trainingHistory}
                                    onChange={value => setForm(current => ({ ...current, trainingHistory: value }))}
                                    placeholder="Ej: Ha trabajado fuerza full body 2 años, luego pasó a running más específico. Nunca ha seguido una periodización formal larga."
                                    rows={3}
                                />
                            </QuestionBlock>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-8">
                            <QuestionBlock label="Objetivo corporal o de composición">
                                <StyledTextarea
                                    value={form.bodyCompositionGoal}
                                    onChange={value => setForm(current => ({ ...current, bodyCompositionGoal: value }))}
                                    placeholder="Ej: Mantener peso mientras mejora rendimiento, bajar grasa de forma lenta, recuperar masa muscular tras lesión..."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Contexto nutricional general">
                                <StyledTextarea
                                    value={form.nutritionContext}
                                    onChange={value => setForm(current => ({ ...current, nutritionContext: value }))}
                                    placeholder="Ej: Come fuera 3 veces por semana, maneja bien macros si se simplifica, suele fallar en fines de semana y viajes."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Recuperación, sueño y contexto físico">
                                <StyledTextarea
                                    value={form.recoveryContext}
                                    onChange={value => setForm(current => ({ ...current, recoveryContext: value }))}
                                    placeholder="Ej: Duerme 6-6.5 h por trabajo, estrés alto en cierres de mes, responde mejor a semanas con una descarga clara cada 4-5 semanas."
                                    rows={3}
                                />
                            </QuestionBlock>

                            <QuestionBlock label="Notas prácticas para el coach">
                                <StyledTextarea
                                    value={form.coachNotes}
                                    onChange={value => setForm(current => ({ ...current, coachNotes: value }))}
                                    placeholder="Ej: Necesita mensajes directos, engancha mejor si le explicas el propósito, mejor no cambiar demasiadas variables a la vez."
                                    rows={3}
                                />
                            </QuestionBlock>
                        </div>
                    )}

                    {step === 6 && (
                        <div className="space-y-6">
                            <ReviewRows form={form} />

                            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1">
                                <p className="text-sm font-semibold text-primary">Listo para generar el perfil del atleta</p>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    La IA consolidará este contexto en un perfil limpio, estructurado y reutilizable. Podrás revisarlo y editarlo antes de aprobarlo.
                                </p>
                            </div>

                            <Button
                                size="lg"
                                className="w-full gap-2 h-11"
                                onClick={handleGenerate}
                                disabled={isGenerating || isSavingStep}
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generando perfil del atleta...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Generar perfil del atleta
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </Card>

                <div className="flex items-center justify-between">
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setStep(prev => Math.max(prev - 1, 1))}
                        disabled={step === 1 || isSavingStep || isGenerating}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                    </Button>

                    {step < STEP_CONFIG.length ? (
                        <Button
                            className="gap-2"
                            onClick={goNext}
                            disabled={isSavingStep || isGenerating}
                        >
                            {isSavingStep ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    Siguiente
                                    <ChevronRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    ) : (
                        <span className="text-xs text-muted-foreground">Último paso</span>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                    Perfil del atleta
                                </span>
                                {mode === 'approved' ? (
                                    <Badge className="border-0 bg-emerald-500/10 text-emerald-600">Activo</Badge>
                                ) : (
                                    <Badge variant="secondary">Pendiente de aprobar</Badge>
                                )}
                                {athleteProfile?.approved_at && mode === 'approved' && (
                                    <Badge variant="outline" className="border-border text-muted-foreground">
                                        Aprobado {format(new Date(athleteProfile.approved_at), "d MMM yyyy", { locale: es })}
                                    </Badge>
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold tracking-tight">Contexto estructurado de {clientName}</h3>
                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground max-w-2xl">
                                    Perfil operativo para que el coach se sitúe rápido y para preparar futuras capas IA centradas en este atleta.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <AIActionButton onClick={startWizard}>
                            Reconfigurar
                        </AIActionButton>
                        <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => {
                                setGeneratedDraft(profileToRender)
                                setIsEditingGenerated(true)
                            }}
                            disabled={!profileToRender}
                        >
                            <Pencil className="h-4 w-4" />
                            Editar perfil
                        </Button>
                        {mode === 'review' && (
                            <Button className="gap-2" onClick={handleApprove} disabled={isApproving}>
                                {isApproving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Aprobando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-4 w-4" />
                                        Aprobar perfil
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </Card>

            {athleteProfile?.answers_json?.athleteDisciplines?.length ? (
                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                            Etiquetas de contexto
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Perfil base del atleta según lo ha descrito el coach.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {athleteProfile.answers_json.athleteDisciplines.map(tag => (
                            <Badge
                                key={tag}
                                variant="secondary"
                                className="rounded-full border-0 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                            >
                                {tag}
                            </Badge>
                        ))}
                    </div>
                </Card>
            ) : null}

            {athleteProfile?.answers_json?.annualGoals?.length ? (
                <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                            Objetivos anuales con fecha
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Hitos concretos guardados en la configuración del atleta.
                        </p>
                    </div>
                    <div className="space-y-2">
                        {athleteProfile.answers_json.annualGoals.map(goal => (
                            <div key={goal.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{goal.title || 'Objetivo sin título'}</p>
                                    <p className="text-xs text-muted-foreground">{formatGoalDate(goal.targetDate)}</p>
                                </div>
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        'border-0 capitalize',
                                        goal.priority === 'principal' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {goal.priority}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}

            {isEditingGenerated && generatedDraft ? (
                <div className="space-y-4">
                    {sections.map(section => (
                        <ProfileSectionCard
                            key={section.key}
                            title={section.title}
                            description={section.description}
                            editable
                            value={generatedDraft[section.key]}
                            onChange={value => setGeneratedDraft(current => current ? { ...current, [section.key]: value } : current)}
                        />
                    ))}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => {
                            setGeneratedDraft(profileToRender)
                            setIsEditingGenerated(false)
                        }}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveGeneratedEdit} disabled={isSavingGeneratedEdit}>
                            {isSavingGeneratedEdit ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : 'Guardar cambios'}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {sections.map(section => (
                        <ProfileSectionCard
                            key={section.key}
                            title={section.title}
                            description={section.description}
                            content={section.content}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
