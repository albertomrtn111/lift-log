'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
    ArrowLeft, ArrowRight, Apple, Check, ClipboardList, Dumbbell, Footprints, Loader2, PartyPopper,
    Save, Sparkles, UserPlus, Zap, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthLogo, SUPPORT_EMAIL } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, AuthInput } from '@/components/auth/AuthFields'
import { premiumFontVars } from '@/lib/premium-fonts'
import { DISCIPLINES, EXPECTED_ATHLETES, type DisciplineId, type ExpectedAthletesId } from '@/lib/onboarding/coach-options'
import {
    ALERT_OPTIONS, CLIENT_TYPE_OPTIONS, LEVEL_OPTIONS, METRICS_OPTIONS, NUTRITION_STALL_OPTIONS, NUTRITION_TOOL_OPTIONS,
    PRIORITY_OPTIONS, PROGRESSION_OPTIONS, RESPONSE_STYLE_OPTIONS, REVIEW_FOCUS_OPTIONS, SETUP_CHAPTERS, SPECIALTY_OPTIONS,
    TONE_OPTIONS, TONE_SAMPLE_MESSAGE, describeMethod, initialsOf, joinList, methodStepError, profileCompletion, splitList,
    validateAboutYou, validateBusiness, visibleSetupSteps, type SetupStepId,
} from '@/lib/onboarding/coach-setup.js'
import { cn } from '@/lib/utils'
import { ChapterProgress, ChipGroup, ChoiceCards, OptionalText, ProfileCard, Question, StepHeading, ToneSample, type ProfileSnapshot } from './setup-ui'
import type { FinishSetupResult, SetupActionResult } from './actions'
import '@/styles/nt-premium.css'

export interface MethodState {
    specialty: string[]
    client_types: string[]
    athlete_level: string[]
    training_priorities: string[]
    progression_style: string
    training_philosophy: string
    macro_or_options: string
    nutrition_no_progress_action: string
    nutrition_rules: string
    metrics_vs_feelings: string
    checkin_priorities: string
    alert_types: string
    communication_tone: string
    response_style: string[]
    free_notes: string
}

export interface CoachSetupInitial {
    step: SetupStepId
    /** Ya había contestado algo: retoma sin la presentación */
    resumed: boolean
    about: { fullName: string; phone: string; city: string }
    business: { businessName: string; instagram: string; website: string }
    disciplines: DisciplineId[]
    expectedAthletes: ExpectedAthletesId | null
    method: MethodState
}

interface Props {
    firstName: string | null
    aiEnabled: boolean
    initial: CoachSetupInitial
    saveStep: (step: SetupStepId, payload: Record<string, unknown>) => Promise<SetupActionResult>
    finish: (method: Record<string, unknown>) => Promise<FinishSetupResult>
    /** Adónde ir al terminar */
    doneHref?: string
}

const DISCIPLINE_ICONS: Record<DisciplineId, LucideIcon> = {
    strength: Dumbbell,
    running: Footprints,
    hybrid: Zap,
    nutrition: Apple,
}

const DISCIPLINE_HINTS: Record<DisciplineId, string> = {
    strength: 'Programas de gimnasio',
    running: 'Carrera, trail y resistencia',
    hybrid: 'Fuerza y cardio juntos',
    nutrition: 'Macros, dietas y hábitos',
}

type Phase = 'intro' | 'steps' | 'finishing' | 'done'

export function CoachSetupWizard({ firstName, aiEnabled, initial, saveStep, finish, doneHref = '/coach/dashboard' }: Props) {
    const [phase, setPhase] = useState<Phase>(initial.resumed ? 'steps' : 'intro')
    const [step, setStep] = useState<SetupStepId>(initial.step)
    const [about, setAbout] = useState(initial.about)
    const [business, setBusiness] = useState(initial.business)
    const [disciplines, setDisciplines] = useState<DisciplineId[]>(initial.disciplines)
    const [expectedAthletes, setExpectedAthletes] = useState<ExpectedAthletesId | null>(initial.expectedAthletes)
    const [method, setMethod] = useState<MethodState>(initial.method)
    const [error, setError] = useState<{ message: string; field?: string } | null>(null)
    const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>(initial.resumed ? 'saved' : 'idle')
    const [latestKey, setLatestKey] = useState<string | null>(null)
    const [result, setResult] = useState<Extract<FinishSetupResult, { success: true }> | null>(null)
    const [isPending, startTransition] = useTransition()
    const topRef = useRef<HTMLDivElement>(null)

    const steps = visibleSetupSteps(disciplines)
    const index = Math.max(0, steps.findIndex(item => item.id === step))
    const current = steps[index] ?? steps[0]
    const isLast = index === steps.length - 1
    const chapterIndex = SETUP_CHAPTERS.findIndex(item => item.id === current.chapter)
    const chapterSteps = steps.filter(item => item.chapter === current.chapter)
    const stepInChapter = chapterSteps.findIndex(item => item.id === current.id) + 1

    const snapshot: ProfileSnapshot = useMemo(() => ({
        fullName: about.fullName,
        city: about.city,
        businessName: business.businessName,
        instagram: business.instagram,
        disciplines,
        method: method as unknown as Record<string, unknown>,
    }), [about, business, disciplines, method])

    // Resalta la última frase que ha cambiado en la ficha
    const linesKey = describeMethod({ disciplines, method: snapshot.method }).map(line => `${line.key}:${line.text}`).join('|')
    const previousLines = useRef(linesKey)
    useEffect(() => {
        if (previousLines.current === linesKey) return
        const before = new Map(previousLines.current.split('|').filter(Boolean).map(entry => [entry.split(':')[0], entry]))
        const changed = linesKey.split('|').filter(Boolean).find(entry => before.get(entry.split(':')[0]) !== entry)
        previousLines.current = linesKey
        if (changed) setLatestKey(changed.split(':')[0])
    }, [linesKey])

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [step, phase])

    const updateMethod = <K extends keyof MethodState>(key: K, value: MethodState[K]) => {
        setError(null)
        setMethod(previous => ({ ...previous, [key]: value }))
    }

    const coachInitials = initialsOf(business.businessName || about.fullName || 'NexTrain')

    const payloadFor = (id: SetupStepId): Record<string, unknown> => {
        if (id === 'tu') return about
        if (id === 'negocio') return business
        if (id === 'disciplinas') return { disciplines, expectedAthletes }
        return method as unknown as Record<string, unknown>
    }

    /** Lo mismo que comprueba el servidor, para avisar al momento */
    const localError = (id: SetupStepId): { message: string; field?: string } | null => {
        if (id === 'tu') {
            const checked = validateAboutYou(about)
            return checked.ok ? null : { message: checked.error, field: checked.field }
        }
        if (id === 'negocio') {
            const checked = validateBusiness(business)
            return checked.ok ? null : { message: checked.error, field: checked.field }
        }
        if (id === 'disciplinas') {
            if (disciplines.length === 0) return { message: 'Elige al menos una disciplina.', field: 'disciplines' }
            if (!expectedAthletes) return { message: 'Indica cuántos atletas llevas, aproximadamente.', field: 'expectedAthletes' }
            return null
        }
        const message = methodStepError(id, method as unknown as Record<string, unknown>)
        return message ? { message } : null
    }

    const goBack = () => {
        setError(null)
        const previous = steps[index - 1]
        if (previous) setStep(previous.id)
        else setPhase('intro')
    }

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault()
        const problem = localError(current.id)
        if (problem) {
            setError(problem)
            return
        }
        setError(null)

        if (isLast) {
            setPhase('finishing')
            startTransition(async () => {
                const finished = await finish(method as unknown as Record<string, unknown>).catch(() => null)
                if (!finished || !finished.success) {
                    setPhase('steps')
                    setError({ message: finished?.error ?? 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' })
                    if (finished && !finished.success && finished.step) setStep(finished.step)
                    return
                }
                setResult(finished)
                setPhase('done')
            })
            return
        }

        setSaved('saving')
        startTransition(async () => {
            const saveResult = await saveStep(current.id, payloadFor(current.id)).catch(() => null)
            if (!saveResult || !saveResult.success) {
                setSaved('idle')
                setError({
                    message: saveResult && !saveResult.success ? saveResult.error : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.',
                    field: saveResult && !saveResult.success ? saveResult.field : undefined,
                })
                return
            }
            setSaved('saved')
            const next = steps[index + 1]
            if (next) setStep(next.id)
        })
    }

    const fieldError = (field: string) => (error?.field === field ? error.message : null)

    // ─── Pantallas sin pasos ────────────────────────────────────────────

    if (phase === 'finishing') {
        return (
            <Frame>
                <FinishingScreen aiEnabled={aiEnabled} profile={snapshot} />
            </Frame>
        )
    }

    if (phase === 'done' && result) {
        return (
            <Frame>
                <DoneScreen firstName={firstName} profile={snapshot} result={result} aiEnabled={aiEnabled} doneHref={doneHref} />
            </Frame>
        )
    }

    if (phase === 'intro') {
        return (
            <Frame>
                <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-32 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:px-10 lg:py-16">
                    <div className="nt-rise max-w-xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                            <PartyPopper className="h-3.5 w-3.5" />
                            Cuenta confirmada
                        </span>
                        <h1 className="nt-display mt-5 text-[2.1rem] leading-[1.04] sm:mt-6 sm:text-[3.2rem] sm:leading-[1.02]">
                            Hola{firstName ? `, ${firstName}` : ''}. Vamos a dejar tu espacio a tu medida.
                        </h1>
                        <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
                            {aiEnabled
                                ? 'Son unos 4 minutos y casi todo es elegir. Con lo que nos cuentes, tu asistente de IA revisará, propondrá y escribirá como tú desde el primer día.'
                                : 'Son unos 4 minutos y casi todo es elegir. Con lo que nos cuentes, tu espacio quedará preparado para tu forma de trabajar.'}
                        </p>

                        <ol className="mt-8 space-y-2.5 sm:mt-9 sm:space-y-3">
                            {SETUP_CHAPTERS.map((chapter, chapterNumber) => (
                                <li key={chapter.id} className="flex items-center gap-4 rounded-2xl border bg-card px-4 py-3.5">
                                    <span className="nt-number flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                                        {chapterNumber + 1}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[15px] font-semibold">{chapter.title}</span>
                                        <span className="block text-[13px] text-muted-foreground">{chapter.subtitle}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>

                        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                            <Save className="h-4 w-4 shrink-0" />
                            Se guarda en cada paso. Si lo dejas a medias, seguirás donde lo dejaste.
                        </p>

                        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-5 pb-[max(0.75rem,var(--safe-area-bottom))] pt-3 sm:px-8 lg:static lg:mt-9 lg:border-0 lg:bg-transparent lg:p-0">
                            <Button
                                size="lg"
                                className="group h-12 w-full rounded-xl text-base font-semibold lg:w-auto lg:px-8"
                                onClick={() => setPhase('steps')}
                                autoFocus
                            >
                                Empezar
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Button>
                        </div>
                    </div>

                    <div className="nt-rise hidden lg:block" style={{ animationDelay: '120ms' }}>
                        <ProfileCard profile={snapshot} aiEnabled={aiEnabled} />
                        <p className="mt-4 flex items-center gap-2 px-2 text-sm text-muted-foreground">
                            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                            Tu perfil se irá escribiendo aquí mientras respondes.
                        </p>
                    </div>
                </div>
            </Frame>
        )
    }

    // ─── Pasos ──────────────────────────────────────────────────────────

    const chapter = SETUP_CHAPTERS[chapterIndex]
    const eyebrow = (
        <span className="nt-eyebrow text-primary">
            {chapter.title} · {stepInChapter} de {chapterSteps.length}
        </span>
    )

    return (
        <Frame
            progress={<ChapterProgress chapter={current.chapter} chapterIndex={chapterIndex} chapterSteps={chapterSteps.length} stepInChapter={stepInChapter} />}
            saved={saved}
        >
            <div ref={topRef} className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-52 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:px-10 lg:pb-16">
                <form onSubmit={handleSubmit} noValidate className="min-w-0 max-w-xl" key={current.id}>
                    <div className="nt-rise">
                        {current.id === 'tu' && (
                            <>
                                <StepHeading
                                    eyebrow={eyebrow}
                                    title="Empecemos por ti"
                                    description="Para poder ayudarte si te atascas. Tus atletas no verán tu teléfono."
                                />
                                <div className="space-y-5">
                                    <AuthField id="fullName" label="Nombre y apellidos">
                                        <AuthInput id="fullName" autoComplete="name" value={about.fullName} maxLength={80} disabled={isPending}
                                            aria-invalid={Boolean(fieldError('fullName'))}
                                            autoFocus={!about.fullName}
                                            onChange={event => { setError(null); setAbout({ ...about, fullName: event.target.value }) }} />
                                    </AuthField>
                                    <FieldError message={fieldError('fullName')} />
                                    <AuthField id="phone" label="Teléfono">
                                        <AuthInput id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ej.: 600 123 456" value={about.phone} maxLength={25} disabled={isPending}
                                            aria-invalid={Boolean(fieldError('phone'))}
                                            autoFocus={Boolean(about.fullName) && !about.phone}
                                            onChange={event => { setError(null); setAbout({ ...about, phone: event.target.value }) }} />
                                    </AuthField>
                                    <FieldError message={fieldError('phone')} />
                                    <AuthField id="city" label="Ciudad">
                                        <AuthInput id="city" autoComplete="address-level2" placeholder="Ej.: Madrid" value={about.city} maxLength={80} disabled={isPending}
                                            aria-invalid={Boolean(fieldError('city'))}
                                            onChange={event => { setError(null); setAbout({ ...about, city: event.target.value }) }} />
                                    </AuthField>
                                    <FieldError message={fieldError('city')} />
                                </div>
                            </>
                        )}

                        {current.id === 'negocio' && (
                            <>
                                <StepHeading
                                    eyebrow={eyebrow}
                                    title="Tu negocio"
                                    description="El nombre lo verán tus atletas en su app y en los emails que les lleguen."
                                />
                                <div className="space-y-5">
                                    <AuthField id="businessName" label="Nombre de tu negocio" hint="Si trabajas con tu nombre, pon tu nombre.">
                                        <AuthInput id="businessName" autoComplete="organization" placeholder="Ej.: Álex Ruiz Coaching" value={business.businessName} maxLength={80} disabled={isPending}
                                            aria-invalid={Boolean(fieldError('businessName'))}
                                            autoFocus={!business.businessName}
                                            onChange={event => { setError(null); setBusiness({ ...business, businessName: event.target.value }) }} />
                                    </AuthField>
                                    <FieldError message={fieldError('businessName')} />
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <AuthField id="instagram" label="Instagram" aside={<span className="text-muted-foreground">Opcional</span>}>
                                            <AuthInput id="instagram" autoCapitalize="none" autoCorrect="off" placeholder="@tuusuario" value={business.instagram} maxLength={80} disabled={isPending}
                                                aria-invalid={Boolean(fieldError('instagram'))}
                                                onChange={event => { setError(null); setBusiness({ ...business, instagram: event.target.value }) }} />
                                        </AuthField>
                                        <AuthField id="website" label="Web" aside={<span className="text-muted-foreground">Opcional</span>}>
                                            <AuthInput id="website" type="url" inputMode="url" autoCapitalize="none" autoComplete="url" placeholder="tuweb.com" value={business.website} maxLength={200} disabled={isPending}
                                                aria-invalid={Boolean(fieldError('website'))}
                                                onChange={event => { setError(null); setBusiness({ ...business, website: event.target.value }) }} />
                                        </AuthField>
                                    </div>
                                    <FieldError message={fieldError('instagram') ?? fieldError('website')} />
                                </div>
                            </>
                        )}

                        {current.id === 'disciplinas' && (
                            <>
                                <StepHeading eyebrow={eyebrow} title="¿Qué entrenas?" description="Así te enseñamos solo lo que vas a usar." />
                                <div className="space-y-9">
                                    <Question label="Tus disciplinas" aside="Varias" error={fieldError('disciplines')}>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {DISCIPLINES.map(option => {
                                                const Icon = DISCIPLINE_ICONS[option.id]
                                                const selected = disciplines.includes(option.id)
                                                return (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        role="checkbox"
                                                        aria-checked={selected}
                                                        disabled={isPending}
                                                        onClick={() => {
                                                            setError(null)
                                                            setDisciplines(list => (list.includes(option.id) ? list.filter(item => item !== option.id) : [...list, option.id]))
                                                        }}
                                                        className={cn(
                                                            'relative flex min-h-[112px] flex-col justify-between rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98]',
                                                            selected ? 'border-primary bg-primary/[0.07] shadow-[0_0_0_1px_hsl(var(--primary))]' : 'border-border bg-card hover:border-primary/50',
                                                        )}
                                                    >
                                                        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition-colors', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                                                            <Icon className="h-5 w-5" />
                                                        </span>
                                                        <span className="mt-4 block">
                                                            <span className="block text-[15px] font-semibold">{option.label}</span>
                                                            <span className="block text-[13px] leading-snug text-muted-foreground">{DISCIPLINE_HINTS[option.id]}</span>
                                                        </span>
                                                        {selected && (
                                                            <span className="absolute right-3.5 top-3.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                                <Check className="h-3 w-3" strokeWidth={3.5} />
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </Question>
                                    <Question label="¿Cuántos atletas llevas, más o menos?" error={fieldError('expectedAthletes')}>
                                        <div role="radiogroup" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                            {EXPECTED_ATHLETES.map(option => {
                                                const selected = expectedAthletes === option.id
                                                return (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={selected}
                                                        disabled={isPending}
                                                        onClick={() => { setError(null); setExpectedAthletes(option.id) }}
                                                        className={cn(
                                                            'nt-number h-12 rounded-2xl border text-[15px] font-semibold tabular-nums transition-[background-color,border-color,box-shadow] duration-150',
                                                            selected ? 'border-primary bg-primary/[0.07] shadow-[0_0_0_1px_hsl(var(--primary))]' : 'border-border bg-card hover:border-primary/50',
                                                        )}
                                                    >
                                                        {option.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </Question>
                                </div>
                            </>
                        )}

                        {current.id === 'especialidad' && (
                            <>
                                <StepHeading
                                    eyebrow={eyebrow}
                                    title="Tu especialidad"
                                    description={aiEnabled
                                        ? 'Desde aquí tu asistente aprende tu método. Fíjate en la ficha: se escribe con lo que elijas.'
                                        : 'Desde aquí tu espacio aprende tu método. Fíjate en la ficha: se escribe con lo que elijas.'}
                                />
                                <div className="space-y-9">
                                    <Question label="¿En qué te especializas?" aside="Varias">
                                        <ChipGroup options={SPECIALTY_OPTIONS} value={method.specialty} onChange={value => updateMethod('specialty', value)} disabled={isPending} />
                                    </Question>
                                    <Question label="¿Con quién trabajas sobre todo?" aside="Opcional">
                                        <ChipGroup options={CLIENT_TYPE_OPTIONS} value={method.client_types} onChange={value => updateMethod('client_types', value)} disabled={isPending} />
                                    </Question>
                                    <Question label="¿Y de qué nivel?" aside="Opcional">
                                        <ChipGroup options={LEVEL_OPTIONS} value={method.athlete_level} onChange={value => updateMethod('athlete_level', value)} disabled={isPending} />
                                    </Question>
                                </div>
                            </>
                        )}

                        {current.id === 'entrenamiento' && (
                            <>
                                <StepHeading eyebrow={eyebrow} title="Cómo programas" description="Lo que pesa más cuando montas un plan." />
                                <div className="space-y-9">
                                    <Question label="¿Qué priorizas al programar?" aside="Mejor 2 o 3">
                                        <ChipGroup options={PRIORITY_OPTIONS} value={method.training_priorities} onChange={value => updateMethod('training_priorities', value)} disabled={isPending} />
                                    </Question>
                                    <Question label="¿Cómo progresas la carga?">
                                        <ChoiceCards options={PROGRESSION_OPTIONS} value={method.progression_style} onChange={value => updateMethod('progression_style', value)} disabled={isPending} />
                                    </Question>
                                    <OptionalText
                                        label="Tu forma de entrenar, en una frase"
                                        value={method.training_philosophy}
                                        onChange={value => updateMethod('training_philosophy', value)}
                                        placeholder="Ej.: Básicos bien hechos, progresión constante y nada de sesiones de relleno."
                                        disabled={isPending}
                                        rows={2}
                                    />
                                </div>
                            </>
                        )}

                        {current.id === 'nutricion' && (
                            <>
                                <StepHeading eyebrow={eyebrow} title="Tu nutrición" description="Cómo pautas la dieta y qué haces cuando algo se atasca." />
                                <div className="space-y-9">
                                    <Question label="¿Con qué trabajas la dieta?">
                                        <ChoiceCards options={NUTRITION_TOOL_OPTIONS} value={method.macro_or_options} onChange={value => updateMethod('macro_or_options', value)} disabled={isPending} />
                                    </Question>
                                    <Question label="Si alguien se estanca siguiendo la dieta…" aside="Opcional">
                                        <ChoiceCards
                                            options={NUTRITION_STALL_OPTIONS.map(value => ({ value }))}
                                            value={method.nutrition_no_progress_action}
                                            onChange={value => updateMethod('nutrition_no_progress_action', value)}
                                            disabled={isPending}
                                        />
                                    </Question>
                                    <OptionalText
                                        label="Alguna regla que nunca te saltas"
                                        value={method.nutrition_rules}
                                        onChange={value => updateMethod('nutrition_rules', value)}
                                        placeholder="Ej.: Nunca menos de 1,6 g de proteína por kilo."
                                        disabled={isPending}
                                        rows={2}
                                    />
                                </div>
                            </>
                        )}

                        {current.id === 'revisiones' && (
                            <>
                                <StepHeading eyebrow={eyebrow} title="Tus revisiones" description="Lo que miras cuando un atleta te manda su revisión semanal." />
                                <div className="space-y-9">
                                    <Question label="¿Qué pesa más, los datos o las sensaciones?">
                                        <ChoiceCards options={METRICS_OPTIONS} value={method.metrics_vs_feelings} onChange={value => updateMethod('metrics_vs_feelings', value)} disabled={isPending} />
                                    </Question>
                                    <Question label="Lo primero que miras" aside="Opcional">
                                        <ChipGroup
                                            options={REVIEW_FOCUS_OPTIONS}
                                            value={splitList(method.checkin_priorities)}
                                            onChange={value => updateMethod('checkin_priorities', joinList(value))}
                                            disabled={isPending}
                                        />
                                    </Question>
                                    <Question
                                        label={aiEnabled ? '¿De qué quieres que te avise tu asistente?' : '¿Qué señales te preocupan más?'}
                                        aside="Opcional"
                                    >
                                        <ChipGroup
                                            options={ALERT_OPTIONS}
                                            value={splitList(method.alert_types)}
                                            onChange={value => updateMethod('alert_types', joinList(value))}
                                            disabled={isPending}
                                        />
                                    </Question>
                                </div>
                            </>
                        )}

                        {current.id === 'comunicacion' && (
                            <>
                                <StepHeading
                                    eyebrow={<span className="nt-eyebrow text-primary">{chapter.title} · último paso</span>}
                                    title="¿Cómo hablas con tus atletas?"
                                    description={aiEnabled
                                        ? 'Tu asistente escribirá así los borradores de tus respuestas. Elige y mira el ejemplo.'
                                        : 'Elige el tono que más se parece a ti y mira el ejemplo.'}
                                />
                                <div className="space-y-9">
                                    <Question label="Tu tono">
                                        <ChoiceCards
                                            options={TONE_OPTIONS.map(option => ({ value: option.value }))}
                                            value={method.communication_tone}
                                            onChange={value => updateMethod('communication_tone', value)}
                                            disabled={isPending}
                                        />
                                    </Question>
                                    <ToneSample
                                        athleteMessage={TONE_SAMPLE_MESSAGE}
                                        reply={TONE_OPTIONS.find(option => option.value === method.communication_tone)?.sample ?? null}
                                        coachInitials={coachInitials}
                                    />
                                    <Question label="¿Cómo te gustan las respuestas?" aside="Opcional">
                                        <ChipGroup options={RESPONSE_STYLE_OPTIONS} value={method.response_style} onChange={value => updateMethod('response_style', value)} disabled={isPending} />
                                    </Question>
                                    <OptionalText
                                        label={aiEnabled ? 'Algo más que deba saber tu asistente' : 'Algo más sobre cómo trabajas'}
                                        value={method.free_notes}
                                        onChange={value => updateMethod('free_notes', value)}
                                        placeholder="Ej.: Tuteo siempre, nada de emojis y firmo como Álex."
                                        disabled={isPending}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {error && !error.field && <div className="mt-8"><AuthAlert>{error.message}</AuthAlert></div>}

                    {/* En móvil, los botones quedan a mano abajo */}
                    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-5 pb-[max(0.75rem,var(--safe-area-bottom))] pt-3 sm:px-8 lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:p-0">
                        {current.chapter !== 'datos' && (
                            <MobileProfile profile={snapshot} aiEnabled={aiEnabled} latestKey={latestKey} />
                        )}
                        <div className="mx-auto flex max-w-xl items-center gap-2.5 lg:mx-0">
                            <Button type="button" variant="outline" size="lg" className="h-12 shrink-0 rounded-xl px-4 text-[15px]" onClick={goBack} disabled={isPending} aria-label="Atrás">
                                <ArrowLeft className="h-4 w-4" />
                                <span className="hidden sm:inline">Atrás</span>
                            </Button>
                            <Button type="submit" size="lg" className="group h-12 flex-1 rounded-xl text-[15px] font-semibold lg:flex-none lg:px-8" disabled={isPending}>
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                    <>
                                        {isLast ? (aiEnabled ? 'Crear mi perfil' : 'Terminar') : 'Continuar'}
                                        {isLast ? <Sparkles className="h-4 w-4" /> : <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>

                <aside className="hidden lg:block" aria-label="Tu perfil">
                    <div className="sticky top-28">
                        <ProfileCard profile={snapshot} aiEnabled={aiEnabled} latestKey={latestKey} />
                        <p className="mt-4 px-2 text-sm text-muted-foreground">
                            {aiEnabled ? 'Esto es lo que va aprendiendo tu asistente. Puedes cambiarlo cuando quieras.' : 'Así queda tu método. Puedes cambiarlo cuando quieras.'}
                        </p>
                    </div>
                </aside>
            </div>
        </Frame>
    )
}

/** En móvil la ficha no cabe al lado: una línea con lo último que ha aprendido, y la ficha entera al tocar */
function MobileProfile({ profile, aiEnabled, latestKey }: { profile: ProfileSnapshot; aiEnabled: boolean; latestKey: string | null }) {
    const [open, setOpen] = useState(false)
    const lines = describeMethod({ disciplines: profile.disciplines, method: profile.method })
    const latest = lines.find(line => line.key === latestKey) ?? lines[lines.length - 1]
    const percent = profileCompletion({ disciplines: profile.disciplines, method: profile.method, about: { fullName: profile.fullName } })

    return (
        <div className="mx-auto mb-3 max-w-xl lg:hidden">
            {open && (
                <div className="nt-rise mb-3 max-h-[55dvh] overflow-y-auto overscroll-contain rounded-[26px]">
                    <ProfileCard profile={profile} aiEnabled={aiEnabled} latestKey={latestKey} />
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                aria-label={open ? 'Ocultar tu perfil' : `Ver tu perfil (${percent} %)`}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5 text-left"
            >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                        <span>{open ? 'Ocultar tu perfil' : 'Tu perfil'}</span>
                        <span className="nt-number tabular-nums text-muted-foreground">{percent} %</span>
                    </span>
                    {!open && (
                        <span key={latest?.text ?? 'vacio'} className="nt-fade mt-0.5 block truncate text-[13px] text-muted-foreground">
                            {latest?.text ?? 'Se irá escribiendo con lo que elijas.'}
                        </span>
                    )}
                </span>
            </button>
        </div>
    )
}

function FieldError({ message }: { message: string | null }) {
    if (!message) return null
    return <p className="-mt-3 text-sm font-medium text-destructive">{message}</p>
}

// ─── Marco ───────────────────────────────────────────────────────────────

function Frame({ children, progress, saved }: { children: React.ReactNode; progress?: React.ReactNode; saved?: 'idle' | 'saving' | 'saved' }) {
    return (
        <div className="auth-shell flex min-h-dvh flex-col bg-background">
            <style dangerouslySetInnerHTML={{ __html: premiumFontVars }} />
            <header className="sticky top-0 z-30 border-b bg-background pt-[var(--safe-area-top)]">
                <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8 lg:px-10">
                    <AuthLogo className="shrink-0" />
                    <div className="min-w-0 flex-1">{progress}</div>
                    <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex" aria-live="polite">
                        {saved === 'saving' && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando</>}
                        {saved === 'saved' && <><Check className="h-3.5 w-3.5 text-success" strokeWidth={3} /> Guardado</>}
                        {(!saved || saved === 'idle') && (
                            <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-foreground">¿Necesitas ayuda?</a>
                        )}
                    </div>
                </div>
            </header>
            <main className="flex flex-1">{children}</main>
        </div>
    )
}

// ─── Creando el perfil ───────────────────────────────────────────────────

const FINISH_STAGES_AI = ['Leyendo tus respuestas', 'Redactando tu metodología', 'Ajustando tu tono', 'Preparando tu espacio']
const FINISH_STAGES = ['Guardando tu método', 'Preparando tu espacio']

function FinishingScreen({ aiEnabled, profile }: { aiEnabled: boolean; profile: ProfileSnapshot }) {
    const stages = aiEnabled ? FINISH_STAGES_AI : FINISH_STAGES
    const [active, setActive] = useState(0)

    useEffect(() => {
        // Avanza a buen ritmo, pero nunca da por hecho el último paso: lo cierra la respuesta
        const timer = setInterval(() => setActive(value => Math.min(value + 1, stages.length - 1)), aiEnabled ? 5000 : 900)
        return () => clearInterval(timer)
    }, [aiEnabled, stages.length])

    return (
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:px-10">
            <div className="nt-rise max-w-md">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Sparkles className="h-6 w-6 animate-pulse" />
                </span>
                <h1 className="nt-display mt-6 text-[2.1rem] leading-tight">{aiEnabled ? 'Creando tu perfil' : 'Guardando tu método'}</h1>
                <p className="mt-2 text-[15px] text-muted-foreground">
                    {aiEnabled ? 'Tarda menos de un minuto. No cierres esta pantalla.' : 'Un momento.'}
                </p>
                <ol className="mt-8 space-y-3.5">
                    {stages.map((stage, stageIndex) => {
                        const done = stageIndex < active
                        const current = stageIndex === active
                        return (
                            <li key={stage} className={cn('flex items-center gap-3 text-[15px] transition-colors', done || current ? 'text-foreground' : 'text-muted-foreground/60')}>
                                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', done ? 'bg-success text-white' : current ? 'bg-primary/10 text-primary' : 'bg-muted')}>
                                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                </span>
                                {stage}
                            </li>
                        )
                    })}
                </ol>
            </div>
            <div className="nt-rise hidden lg:block" style={{ animationDelay: '120ms' }}>
                <ProfileCard profile={profile} aiEnabled={aiEnabled} footer={false} className={aiEnabled ? 'nt-reading' : undefined} />
            </div>
        </div>
    )
}

// ─── Listo ───────────────────────────────────────────────────────────────

function DoneScreen({ firstName, profile, result, aiEnabled, doneHref }: {
    firstName: string | null
    profile: ProfileSnapshot
    result: Extract<FinishSetupResult, { success: true }>
    aiEnabled: boolean
    doneHref: string
}) {
    const next = [
        { icon: Sparkles, title: 'Conoce a Lucía, tu atleta de ejemplo', text: 'Tiene datos de prueba para que veas cómo llegan las revisiones y cómo ve ella su plan.' },
        { icon: UserPlus, title: 'Invita a tu primer atleta', text: 'Le llega un enlace por email y entra desde el móvil, sin descargar nada.' },
        { icon: ClipboardList, title: 'Prepárale su primer plan', text: aiEnabled ? 'Desde una plantilla, desde cero o con tu asistente de IA.' : 'Desde una plantilla o desde cero.' },
    ]

    return (
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:px-10 lg:py-16">
            <div className="nt-rise min-w-0 max-w-xl">
                <span className="nt-pop-in flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success ring-1 ring-success/15">
                    <Check className="h-7 w-7" strokeWidth={3} />
                </span>
                <h1 className="nt-display mt-6 text-[2.4rem] leading-[1.02] sm:text-[3rem]">
                    Listo{firstName ? `, ${firstName}` : ''}. Tu espacio ya trabaja como tú.
                </h1>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
                    {result.aiReady
                        ? 'Tu asistente ya tiene tu perfil. Lo usará en cada revisión, propuesta y borrador de respuesta.'
                        : aiEnabled
                            ? 'Tus respuestas están guardadas. No hemos podido crear tu perfil de IA ahora mismo: puedes crearlo con un clic desde Ajustes › Perfil de IA.'
                            : 'Tu método está guardado. Puedes cambiarlo cuando quieras desde Ajustes.'}
                </p>

                <p className="nt-eyebrow mt-10 text-muted-foreground">Lo siguiente</p>
                <ol className="mt-4 space-y-3">
                    {next.map((item, itemIndex) => (
                        <li key={item.title} className="nt-rise flex gap-4 rounded-2xl border bg-card p-4" style={{ animationDelay: `${150 + itemIndex * 90}ms` }}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <item.icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[15px] font-semibold">{item.title}</span>
                                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{item.text}</span>
                            </span>
                        </li>
                    ))}
                </ol>

                <Button asChild size="lg" className="group mt-9 h-12 w-full rounded-xl text-base font-semibold sm:w-auto sm:px-8">
                    <a href={doneHref}>
                        Ir a mi panel
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </a>
                </Button>
            </div>

            <div className="nt-rise min-w-0" style={{ animationDelay: '120ms' }}>
                <ProfileCard profile={profile} aiEnabled={aiEnabled} footer={false} />
                {result.aiSummary && (
                    <figure className="mt-4 rounded-[22px] border bg-card p-5">
                        <figcaption className="nt-eyebrow mb-3 flex items-center gap-1.5 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            Tu asistente te describe así
                        </figcaption>
                        <blockquote className="text-[14px] leading-relaxed text-foreground/90">{result.aiSummary}</blockquote>
                    </figure>
                )}
            </div>
        </div>
    )
}
