'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { saveOnboardingStep, approveCoachAIProfile } from './actions'
import type { CoachAIProfileOutput } from '@/lib/ai/generate-coach-profile'
import type { CoachAIProfile } from '@/data/coach-ai-profile'
import {
    Loader2,
    ChevronRight,
    ChevronLeft,
    Sparkles,
    CheckCircle2,
    Brain,
    Dumbbell,
    Apple,
    ClipboardList,
    MessageSquare,
    Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { QuestionBlock, StyledTextarea, ChipSelect, INITIAL, toInitialForm, Step1, Step2, Step3, Step4, Step5, type FormState } from './profile-steps'

function StepSummary({
    form,
    onGenerate,
    isGenerating,
}: {
    form: FormState
    onGenerate: () => void
    isGenerating: boolean
}) {
    const rows = [
        { label: 'Especialidad', value: form.specialty.join(', ') || '—' },
        { label: 'Tipo de cliente', value: form.client_types.join(', ') || '—' },
        { label: 'Nivel atleta', value: form.athlete_level.join(', ') || '—' },
        { label: 'Filosofía entreno', value: form.training_philosophy || '—' },
        { label: 'Prioridades', value: form.training_priorities.join(', ') || '—' },
        { label: 'Herramienta nutri.', value: form.macro_or_options || '—' },
        { label: 'Enfoque nutricional', value: form.nutrition_approach || '—' },
        { label: 'Tono', value: form.communication_tone || '—' },
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
                        <span className="text-muted-foreground w-36 shrink-0 font-medium">{row.label}</span>
                        <span className="text-foreground line-clamp-2">{row.value}</span>
                    </div>
                ))}
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1">
                <p className="text-sm font-semibold text-primary">Listo para generar tu perfil IA</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    La IA analizará todas tus respuestas y creará una configuración personalizada para entrenamiento, nutrición y revisiones. Podrás revisarla antes de activarla.
                </p>
            </div>

            <Button
                size="lg"
                className="w-full gap-2 h-11"
                onClick={onGenerate}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando tu perfil IA...
                    </>
                ) : (
                    <>
                        <Sparkles className="h-4 w-4" />
                        Generar perfil IA
                    </>
                )}
            </Button>
        </div>
    )
}

// ─────────────────────────────────────────────
// Profile review screen
// ─────────────────────────────────────────────

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</h3>
            {children}
        </div>
    )
}

function ReviewCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border border-border bg-card p-5 shadow-sm', className)}>
            {children}
        </div>
    )
}

function ProfileReview({
    output,
    onApprove,
    isApproving,
}: {
    output: CoachAIProfileOutput
    onApprove: () => void
    isApproving: boolean
}) {
    return (
        <div className="space-y-6">
            <ReviewBlock title="Resumen del coach">
                <ReviewCard>
                    <p className="text-sm text-foreground leading-relaxed">{output.professional_summary}</p>
                </ReviewCard>
            </ReviewBlock>

            <ReviewBlock title="Metodología">
                <div className="space-y-2">
                    {[
                        { icon: Dumbbell, label: 'Entrenamiento', text: output.methodology.training },
                        { icon: Apple, label: 'Nutrición', text: output.methodology.nutrition },
                        { icon: ClipboardList, label: 'Revisiones', text: output.methodology.reviews },
                    ].map(({ icon: Icon, label, text }) => (
                        <ReviewCard key={label}>
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="h-3.5 w-3.5 text-primary" />
                                <span className="text-xs font-semibold text-primary">{label}</span>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{text}</p>
                        </ReviewCard>
                    ))}
                </div>
            </ReviewBlock>

            <ReviewBlock title="Estilo de comunicación">
                <ReviewCard>
                    <p className="text-sm text-foreground leading-relaxed">{output.communication_style}</p>
                </ReviewCard>
            </ReviewBlock>

            <ReviewBlock title="Reglas maestras">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ReviewCard>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-3">Siempre hacer</p>
                        <ul className="space-y-2">
                            {output.master_rules.always_do.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                    <span className="text-green-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </ReviewCard>
                    <ReviewCard>
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-3">Nunca hacer</p>
                        <ul className="space-y-2">
                            {output.master_rules.never_do.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </ReviewCard>
                    <ReviewCard>
                        <p className="text-xs font-semibold text-primary mb-3">Criterios clave</p>
                        <ul className="space-y-2">
                            {output.master_rules.decision_criteria.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </ReviewCard>
                </div>
            </ReviewBlock>

            <ReviewBlock title="Configuración base de IA">
                <ReviewCard>
                    <p className="text-xs text-muted-foreground mb-3">
                        Este bloque se usará como contexto base en todas las funcionalidades IA del sistema.
                    </p>
                    <div className="bg-muted rounded-lg p-4 text-xs text-muted-foreground leading-relaxed font-mono max-h-44 overflow-y-auto">
                        {output.system_prompt}
                    </div>
                </ReviewCard>
            </ReviewBlock>

            <Button
                size="lg"
                className="w-full gap-2 h-11"
                onClick={onApprove}
                disabled={isApproving}
            >
                {isApproving ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aprobando perfil...
                    </>
                ) : (
                    <>
                        <CheckCircle2 className="h-4 w-4" />
                        Aprobar perfil y entrar a la aplicación
                    </>
                )}
            </Button>
        </div>
    )
}

// ─────────────────────────────────────────────
// Step config
// ─────────────────────────────────────────────

const STEP_CONFIG = [
    { title: 'Especialidad y clientes', subtitle: 'Define tu nicho y tipo de cliente', icon: Brain },
    { title: 'Entrenamiento', subtitle: 'Tu filosofía y forma de programar', icon: Dumbbell },
    { title: 'Nutrición', subtitle: 'Tu enfoque y reglas con la dieta', icon: Apple },
    { title: 'Revisiones', subtitle: 'Cómo analizas y decides ajustes', icon: ClipboardList },
    { title: 'Comunicación', subtitle: 'Tu tono y configuración final', icon: MessageSquare },
    { title: 'Resumen', subtitle: 'Revisa y genera tu perfil IA', icon: Sparkles },
]

const TOTAL_STEPS = STEP_CONFIG.length

// ─────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
    return (
        <div className="flex items-center justify-between relative px-1">
            {/* base line */}
            <div className="absolute top-[13px] left-4 right-4 h-px bg-border" />
            {/* progress line */}
            <div
                className="absolute top-[13px] left-4 h-px bg-primary transition-all duration-500"
                style={{ width: `calc(${((step - 1) / (TOTAL_STEPS - 1)) * 100}% - 8px)` }}
            />
            {STEP_CONFIG.map((s, i) => {
                const num = i + 1
                const done = num < step
                const current = num === step
                return (
                    <div key={num} className="flex flex-col items-center gap-1.5 z-10">
                        <div
                            className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 border',
                                done
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : current
                                        ? 'bg-primary border-primary text-primary-foreground ring-4 ring-primary/20'
                                        : 'bg-background border-border text-muted-foreground',
                            )}
                        >
                            {done ? <Check className="h-3.5 w-3.5" /> : num}
                        </div>
                        <span
                            className={cn(
                                'text-[10px] font-medium text-center leading-tight hidden sm:block max-w-[56px]',
                                current ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground',
                            )}
                        >
                            {s.title.split(' ')[0]}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function CoachAIOnboarding({ initialProfile }: { initialProfile?: CoachAIProfile | null }) {
    const router = useRouter()
    const { toast } = useToast()

    const [step, setStep] = useState(1)
    const [form, setForm] = useState<FormState>(() => toInitialForm(initialProfile))
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [generatedOutput, setGeneratedOutput] = useState<CoachAIProfileOutput | null>(() => {
        const raw = initialProfile?.generated_profile_json
        if (!raw) return null

        const parsed = raw as Partial<CoachAIProfileOutput>
        if (
            typeof parsed.professional_summary === 'string' &&
            parsed.methodology &&
            typeof parsed.methodology.training === 'string' &&
            typeof parsed.methodology.nutrition === 'string' &&
            typeof parsed.methodology.reviews === 'string' &&
            typeof parsed.communication_style === 'string' &&
            parsed.master_rules &&
            Array.isArray(parsed.master_rules.always_do) &&
            Array.isArray(parsed.master_rules.never_do) &&
            Array.isArray(parsed.master_rules.decision_criteria) &&
            typeof parsed.system_prompt === 'string'
        ) {
            return parsed as CoachAIProfileOutput
        }

        return null
    })

    const currentConfig = STEP_CONFIG[step - 1]
    const StepIcon = currentConfig.icon

    const saveCurrentStep = async (): Promise<boolean> => {
        setIsSaving(true)
        const result = await saveOnboardingStep(form)
        setIsSaving(false)
        if (!result.success) {
            toast({ title: 'Error al guardar', description: result.error, variant: 'destructive' })
            return false
        }
        return true
    }

    const handleNext = async () => {
        const ok = await saveCurrentStep()
        if (ok) setStep(s => Math.min(s + 1, TOTAL_STEPS))
    }

    const handleBack = () => setStep(s => Math.max(s - 1, 1))

    const handleGenerate = async () => {
        const saved = await saveCurrentStep()
        if (!saved) return

        setIsGenerating(true)
        try {
            const res = await fetch('/api/ai/generate-coach-profile', { method: 'POST' })
            const data = await res.json()
            if (!data.success) {
                toast({ title: 'Error al generar el perfil', description: data.error, variant: 'destructive' })
                return
            }
            setGeneratedOutput(data.output as CoachAIProfileOutput)
        } catch {
            toast({ title: 'Error de conexión', description: 'No se pudo conectar con el servidor.', variant: 'destructive' })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleApprove = async () => {
        setIsApproving(true)
        const result = await approveCoachAIProfile()
        if (!result.success) {
            toast({ title: 'Error al aprobar', description: result.error, variant: 'destructive' })
            setIsApproving(false)
            return
        }
        router.push('/coach/dashboard')
        router.refresh()
    }

    // ── Generated profile review ──
    if (generatedOutput) {
        return (
            <div className="min-h-screen bg-background">
                <div className="max-w-2xl mx-auto px-4 py-10 pb-24">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
                            <CheckCircle2 className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">Tu perfil IA está listo</h1>
                        <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
                            Revisa lo que la IA ha sintetizado sobre tu metodología. Si estás de acuerdo, apruébalo para activar la personalización.
                        </p>
                    </div>
                    <ProfileReview output={generatedOutput} onApprove={handleApprove} isApproving={isApproving} />
                </div>
            </div>
        )
    }

    // ── Wizard ──
    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-2xl mx-auto px-4 py-8 pb-28">

                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 text-primary">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-xs font-semibold uppercase tracking-widest">Perfil IA del coach · opcional</span>
                        </div>
                        <Link href="/coach/dashboard" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                            Hacerlo más tarde
                        </Link>
                    </div>
                    <div className="flex items-end justify-between mb-1">
                        <h1 className="text-2xl font-bold text-foreground">Configura tu IA personal</h1>
                        <span className="text-sm text-muted-foreground shrink-0 ml-4 font-medium">
                            {step} / {TOTAL_STEPS}
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">
                        La IA aprenderá tu metodología y trabajará como una extensión de ti.
                    </p>

                    {/* Stepper */}
                    <Stepper step={step} />
                </div>

                {/* Step card */}
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden mb-6">
                    {/* Step header */}
                    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <StepIcon className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">{currentConfig.title}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">{currentConfig.subtitle}</p>
                        </div>
                    </div>

                    {/* Step content */}
                    <div className="px-6 py-7">
                        {step === 1 && <Step1 form={form} setForm={setForm} />}
                        {step === 2 && <Step2 form={form} setForm={setForm} />}
                        {step === 3 && <Step3 form={form} setForm={setForm} />}
                        {step === 4 && <Step4 form={form} setForm={setForm} />}
                        {step === 5 && <Step5 form={form} setForm={setForm} />}
                        {step === 6 && (
                            <StepSummary form={form} onGenerate={handleGenerate} isGenerating={isGenerating} />
                        )}
                    </div>
                </div>

                {/* Navigation */}
                {step < 6 && (
                    <div className="fixed bottom-0 left-0 right-0 sm:relative bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none border-t border-border sm:border-0 px-4 py-4 sm:px-0 sm:py-0">
                        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
                            <Button
                                variant="ghost"
                                onClick={handleBack}
                                disabled={step === 1 || isSaving}
                                className="gap-1.5 text-muted-foreground hover:text-foreground"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </Button>

                            <Button
                                onClick={handleNext}
                                disabled={isSaving}
                                className="gap-1.5 min-w-[120px]"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        {step === 5 ? 'Ver resumen' : 'Siguiente'}
                                        <ChevronRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
