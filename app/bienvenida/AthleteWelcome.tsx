'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    ArrowRight,
    Bell,
    CalendarDays,
    Camera,
    ChartNoAxesColumnIncreasing,
    Check,
    ClipboardList,
    Download,
    Dumbbell,
    Loader2,
    MessageCircle,
    MoreVertical,
    PlusSquare,
    Salad,
    Share,
    Smartphone,
    UserRound,
    Watch,
    type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, PasswordInput, PasswordStrength } from '@/components/auth/AuthFields'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/auth-errors'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { AvatarPhotoPicker } from '@/components/profile/AvatarPhotoPicker'
import { cn } from '@/lib/utils'
import type { AthleteWelcomeData } from '@/lib/onboarding/athlete-welcome-data'
import { markAthleteSignedUpAction } from '../(auth)/set-password/actions'
import { setAthleteOnboardingStepAction } from './actions'

type StepId = 'tour' | 'install' | 'push' | 'photo' | 'watch' | 'form'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Android lanza beforeinstallprompt al cargar, a menudo antes de montar el paso:
// lo guardamos a nivel de módulo para poder usarlo después.
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
const installPromptListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        deferredInstallPrompt = event as BeforeInstallPromptEvent
        installPromptListeners.forEach(listener => listener())
    })
}

function detectPlatform(): 'ios' | 'android' | 'desktop' {
    if (typeof navigator === 'undefined') return 'desktop'
    const ua = navigator.userAgent
    if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
    if (/android/i.test(ua)) return 'android'
    return 'desktop'
}

function isStandalone() {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches
        || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function AthleteWelcome({ data, email, stravaResult }: {
    data: AthleteWelcomeData
    email: string
    stravaResult: 'connected' | 'error' | null
}) {
    const router = useRouter()
    const [needsPassword, setNeedsPassword] = useState(data.needsPassword)
    const [resolved, setResolved] = useState<Record<StepId, boolean>>(() => {
        const initial = Object.fromEntries(data.steps.steps.map(step => [step.id, step.resolved])) as Record<StepId, boolean>
        if (stravaResult === 'connected') initial.watch = true
        return initial
    })
    const watchResolvedOnLoad = data.steps.steps.find(step => step.id === 'watch')?.resolved ?? false
    const nothingStarted = !data.state.tour && !data.state.install && !data.state.push && !data.state.photo && !data.state.watch
    const [showIntro, setShowIntro] = useState(needsPassword || (nothingStarted && stravaResult === null))

    const steps = data.steps.steps
    const currentIndex = steps.findIndex(step => !resolved[step.id])
    const current = currentIndex === -1 ? null : steps[currentIndex]

    const resolveStep = useCallback((step: Exclude<StepId, 'form'>, resolution: 'done' | 'skipped') => {
        setResolved(prev => ({ ...prev, [step]: true }))
        void setAthleteOnboardingStepAction(step, resolution)
    }, [])
    const finishTour = useCallback(() => resolveStep('tour', 'done'), [resolveStep])
    const resolveInstall = useCallback((resolution: 'done' | 'skipped') => resolveStep('install', resolution), [resolveStep])
    const resolvePush = useCallback((resolution: 'done' | 'skipped') => resolveStep('push', resolution), [resolveStep])
    const resolvePhoto = useCallback((resolution: 'done' | 'skipped') => resolveStep('photo', resolution), [resolveStep])
    const skipWatch = useCallback(() => resolveStep('watch', 'skipped'), [resolveStep])

    // Vuelta de Strava: queda conectado y se avanza
    useEffect(() => {
        if (stravaResult === 'connected' && !watchResolvedOnLoad) {
            void setAthleteOnboardingStepAction('watch', 'done')
        }
        if (stravaResult) router.replace('/bienvenida', { scroll: false })
    }, [stravaResult, watchResolvedOnLoad, router])

    // Todo hecho: al plan
    useEffect(() => {
        if (!showIntro && !needsPassword && currentIndex === -1) router.replace('/planning')
    }, [showIntro, needsPassword, currentIndex, router])

    return (
        <AuthShell
            panelTitle={<>Tu plan, <span className="text-sky-300">en el bolsillo</span></>}
            panelText={`${data.coachName} te acompaña desde la app: plan, revisiones y chat.`}
        >
            {showIntro ? (
                <IntroScreen
                    data={data}
                    email={email}
                    needsPassword={needsPassword}
                    onPasswordCreated={() => setNeedsPassword(false)}
                    onStart={() => setShowIntro(false)}
                />
            ) : current ? (
                <div>
                    <StepHeader index={currentIndex} total={steps.length} optional={current.optional} />
                    {current.id === 'tour' && <TourStep coachName={data.coachName} onDone={finishTour} />}
                    {current.id === 'install' && <InstallStep onResolve={resolveInstall} />}
                    {current.id === 'push' && <PushStep coachName={data.coachName} onResolve={resolvePush} />}
                    {current.id === 'photo' && <PhotoStep data={data} onResolve={resolvePhoto} />}
                    {current.id === 'watch' && <WatchStep stravaError={stravaResult === 'error'} onSkip={skipWatch} />}
                    {current.id === 'form' && <FormStep data={data} />}
                </div>
            ) : (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            )}
        </AuthShell>
    )
}

// ---------------------------------------------------------------------------
// Introducción + contraseña
// ---------------------------------------------------------------------------

function IntroScreen({ data, email, needsPassword, onPasswordCreated, onStart }: {
    data: AthleteWelcomeData
    email: string
    needsPassword: boolean
    onPasswordCreated: () => void
    onStart: () => void
}) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const pendingSteps = data.steps.steps.filter(step => !step.resolved)

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault()
        setError(null)
        if (!needsPassword) {
            onStart()
            return
        }
        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.')
            return
        }
        startTransition(async () => {
            const { error: updateError } = await createClient().auth.updateUser({ password })
            if (updateError) {
                setError(authErrorMessage(updateError))
                return
            }
            await markAthleteSignedUpAction().catch(() => undefined)
            onPasswordCreated()
            onStart()
        })
    }

    return (
        <div>
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">Hola, {data.firstName}.</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {data.coachName} ya te ha dado de alta. {pendingSteps.length > 0
                    ? `Faltan ${pendingSteps.length} ${pendingSteps.length === 1 ? 'cosa' : 'cosas'} y empiezas.`
                    : 'Ya lo tienes casi todo.'}
            </p>

            <ol className="mt-6 space-y-2">
                {data.steps.steps.map((step, index) => (
                    <li key={step.id} className="flex items-center gap-3 rounded-xl border border-border/70 px-3.5 py-3">
                        <span className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            step.resolved ? 'bg-success text-white' : 'bg-primary/10 text-primary',
                        )}>
                            {step.resolved ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium">
                            {step.id === 'form' ? `Formulario de ${data.coachName}` : step.title}
                            {step.optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcional)</span>}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{step.duration}</span>
                    </li>
                ))}
            </ol>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                {needsPassword && (
                    <>
                        {/* Para que el gestor de contraseñas la guarde con el email correcto */}
                        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
                        <AuthField id="password" label="Crea tu contraseña" hint={<PasswordStrength value={password} />}>
                            <PasswordInput
                                id="password"
                                autoComplete="new-password"
                                placeholder="Mínimo 6 caracteres"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                minLength={6}
                                disabled={isPending}
                            />
                        </AuthField>
                    </>
                )}
                {error && <AuthAlert>{error}</AuthAlert>}
                <Button type="submit" size="lg" className="group h-11 w-full rounded-xl text-[15px] font-semibold" disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                            {needsPassword ? 'Guardar y empezar' : 'Empezar'}
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                    )}
                </Button>
            </form>
        </div>
    )
}

function StepHeader({ index, total, optional }: { index: number; total: number; optional: boolean }) {
    return (
        <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Paso {index + 1} de {total}{optional && ' · opcional'}
            </p>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden>
                {Array.from({ length: total }, (_, i) => (
                    <span key={i} className={cn('h-1.5 rounded-full', i <= index ? 'bg-primary' : 'bg-border')} />
                ))}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Paso 1 · Cómo funciona la app
// ---------------------------------------------------------------------------

/** Las pestañas de la barra inferior, en el mismo orden */
function tourSections(coachName: string): { icon: LucideIcon; title: string; text: string }[] {
    return [
        { icon: Dumbbell, title: 'Fuerza', text: 'Tu rutina con series y pesos. Apunta lo que levantas.' },
        { icon: Salad, title: 'Dieta', text: 'Tus macros, tus comidas y tus suplementos.' },
        { icon: CalendarDays, title: 'Plan', text: 'Tu semana día a día: qué toca hoy.' },
        { icon: ChartNoAxesColumnIncreasing, title: 'Progreso', text: 'Tu evolución, tus revisiones y tus fotos.' },
        { icon: MessageCircle, title: 'Chat', text: `Escribe a ${coachName} cuando lo necesites.` },
    ]
}

function TourStep({ coachName, onDone }: { coachName: string; onDone: () => void }) {
    return (
        <div>
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Así funciona NexTrain</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {coachName} prepara tu plan y lo ves aquí. Tú entrenas, apuntas lo que haces y {coachName} lo revisa.
            </p>

            <ul className="mt-5 divide-y divide-border/60 rounded-2xl border border-border/70" aria-label="Pestañas de la app">
                {tourSections(coachName).map(section => (
                    <li key={section.title} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <section.icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 text-sm leading-snug">
                            <span className="block font-semibold">{section.title}</span>
                            <span className="block text-muted-foreground">{section.text}</span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Arriba a la derecha: notificaciones
                <Bell className="mx-1 inline-block h-3.5 w-3.5 -translate-y-px" aria-hidden />
                y perfil<UserRound className="ml-1 inline-block h-3.5 w-3.5 -translate-y-px" aria-hidden />.
            </p>

            <Button size="lg" className="group mt-6 h-11 w-full rounded-xl text-[15px] font-semibold" onClick={onDone}>
                Entendido
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Paso 2 · Instalar la app
// ---------------------------------------------------------------------------

function InstallStep({ onResolve }: { onResolve: (resolution: 'done' | 'skipped') => void }) {
    const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(deferredInstallPrompt)
    const [iosConfirmed, setIosConfirmed] = useState(false)
    const resolvedRef = useRef(false)

    useEffect(() => {
        setPlatform(detectPlatform())
        // Abierta desde el icono: ya está instalada
        if (isStandalone() && !resolvedRef.current) {
            resolvedRef.current = true
            onResolve('done')
            return
        }
        const listener = () => setInstallEvent(deferredInstallPrompt)
        installPromptListeners.add(listener)
        return () => { installPromptListeners.delete(listener) }
    }, [onResolve])

    const handleAndroidInstall = async () => {
        if (!installEvent) return
        await installEvent.prompt()
        const { outcome } = await installEvent.userChoice
        deferredInstallPrompt = null
        setInstallEvent(null)
        if (outcome === 'accepted') onResolve('done')
    }

    if (iosConfirmed) {
        return (
            <div>
                <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Ahora ábrela desde el icono</h1>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    Busca NexTrain en tu pantalla de inicio y ábrela. Te pedirá tu email y la contraseña que acabas de crear; seguirás justo aquí.
                </p>
                <Button variant="ghost" className="mt-6 h-11 w-full rounded-xl" onClick={() => onResolve('done')}>
                    Prefiero seguir en Safari
                </Button>
            </div>
        )
    }

    return (
        <div>
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Smartphone className="h-6 w-6" />
            </span>
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Instala la app</h1>

            {platform === 'ios' && (
                <>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                        En iPhone, sin instalar la app no te llegan los avisos. Se hace en tres toques desde Safari:
                    </p>
                    <ol className="mt-5 space-y-3 text-[15px]">
                        <InstructionRow n={1} icon={<Share className="h-4 w-4" />}>Toca <strong>Compartir</strong> en la barra de Safari.</InstructionRow>
                        <InstructionRow n={2} icon={<PlusSquare className="h-4 w-4" />}>Elige <strong>«Añadir a pantalla de inicio»</strong>.</InstructionRow>
                        <InstructionRow n={3} icon={<Smartphone className="h-4 w-4" />}>Abre NexTrain <strong>desde el icono</strong>.</InstructionRow>
                    </ol>
                    <div className="mt-7 flex flex-col gap-2.5">
                        <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={() => setIosConfirmed(true)}>
                            Ya la he añadido
                        </Button>
                        <Button variant="ghost" className="h-10 rounded-xl" onClick={() => onResolve('skipped')}>
                            Ahora no
                        </Button>
                    </div>
                </>
            )}

            {platform === 'android' && (
                <>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                        Así la tendrás a un toque y te llegarán los avisos. En Android basta con aceptar el aviso de instalación.
                    </p>
                    {!installEvent && (
                        <ol className="mt-5 space-y-3 text-[15px]">
                            <InstructionRow n={1} icon={<MoreVertical className="h-4 w-4" />}>Abre el menú <strong>⋮</strong> del navegador.</InstructionRow>
                            <InstructionRow n={2} icon={<Download className="h-4 w-4" />}>Toca <strong>«Instalar aplicación»</strong>.</InstructionRow>
                        </ol>
                    )}
                    <div className="mt-7 flex flex-col gap-2.5">
                        {installEvent ? (
                            <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={handleAndroidInstall}>
                                <Download className="h-4 w-4" />
                                Instalar la app
                            </Button>
                        ) : (
                            <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={() => onResolve('done')}>
                                Ya la he instalado
                            </Button>
                        )}
                        <Button variant="ghost" className="h-10 rounded-xl" onClick={() => onResolve('skipped')}>
                            Ahora no
                        </Button>
                    </div>
                </>
            )}

            {platform === 'desktop' && (
                <>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                        Estás en un ordenador. La app está pensada para el móvil: abre el email de invitación en tu teléfono para instalarla y recibir avisos.
                    </p>
                    <div className="mt-7 flex flex-col gap-2.5">
                        <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={() => onResolve('skipped')}>
                            Seguir desde el ordenador
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}

function InstructionRow({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{n}</span>
            <span className="flex-1">{children}</span>
            <span className="text-muted-foreground" aria-hidden>{icon}</span>
        </li>
    )
}

// ---------------------------------------------------------------------------
// Paso 3 · Avisos
// ---------------------------------------------------------------------------

function PushStep({ coachName, onResolve }: { coachName: string; onResolve: (resolution: 'done' | 'skipped') => void }) {
    const { permissionState, isSubscribed, isLoading, subscribe, lastError } = usePushNotifications()
    const [denied, setDenied] = useState(false)

    useEffect(() => {
        if (isSubscribed) onResolve('done')
    }, [isSubscribed, onResolve])

    const examples = useMemo(() => [
        { title: coachName, body: `${coachName} te ha enviado tu plan de la semana` },
        { title: 'Revisión', body: 'Tienes una revisión pendiente: 5 minutos' },
        { title: 'Chat', body: `Nuevo mensaje de ${coachName}` },
    ], [coachName])

    const handleActivate = async () => {
        const ok = await subscribe()
        if (ok) onResolve('done')
        else if (Notification.permission === 'denied') setDenied(true)
    }

    const unsupported = permissionState === 'unsupported'
    const blocked = denied || permissionState === 'denied'

    return (
        <div>
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bell className="h-6 w-6" />
            </span>
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Activa los avisos</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Te avisaremos solo de lo importante. Por ejemplo:</p>

            <ul className="mt-5 space-y-2" aria-label="Ejemplos de avisos">
                {examples.map(example => (
                    <li key={example.body} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 px-3.5 py-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <Bell className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 text-sm">
                            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">NexTrain · {example.title}</span>
                            <span className="block font-medium leading-snug">{example.body}</span>
                        </span>
                    </li>
                ))}
            </ul>

            {unsupported && (
                <div className="mt-5">
                    <AuthAlert tone="info" title="Aquí no se pueden activar los avisos">
                        {detectPlatform() === 'ios'
                            ? 'En iPhone solo llegan con la app instalada y abierta desde el icono.'
                            : 'Prueba desde Chrome o Safari en tu móvil. Puedes activarlos más tarde en tu perfil.'}
                    </AuthAlert>
                </div>
            )}
            {blocked && (
                <div className="mt-5">
                    <AuthAlert tone="warning" title="Los avisos están bloqueados">
                        Actívalos para NexTrain en los ajustes del navegador o del móvil y vuelve a intentarlo.
                    </AuthAlert>
                </div>
            )}
            {lastError && !blocked && !unsupported && (
                <div className="mt-5"><AuthAlert>{lastError}</AuthAlert></div>
            )}

            <div className="mt-7 flex flex-col gap-2.5">
                {!unsupported && (
                    <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={handleActivate} disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                        Activar avisos
                    </Button>
                )}
                <Button variant="ghost" className="h-10 rounded-xl" onClick={() => onResolve('skipped')}>
                    Ahora no
                </Button>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Paso 4 · Foto de perfil
// ---------------------------------------------------------------------------

function PhotoStep({ data, onResolve }: { data: AthleteWelcomeData; onResolve: (resolution: 'done' | 'skipped') => void }) {
    return (
        <div>
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Ponte una foto de perfil</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Con tu foto la cuenta queda completa y se ve mucho más profesional. Hazte una o elígela de la galería.
            </p>
            <AvatarPhotoPicker name={data.fullName} initialUrl={data.avatarUrl} className="mt-7">
                {({ choose, uploading, uploaded }) => (
                    <div className="mt-7 flex flex-col gap-2.5">
                        {uploaded ? (
                            <>
                                <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={() => onResolve('done')}>
                                    Continuar
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" className="h-10 rounded-xl" onClick={choose} disabled={uploading}>
                                    Cambiar foto
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={choose} disabled={uploading}>
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                    {uploading ? 'Subiendo…' : 'Elegir foto'}
                                </Button>
                                <Button variant="ghost" className="h-10 rounded-xl" onClick={() => onResolve('skipped')} disabled={uploading}>
                                    Ahora no
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </AvatarPhotoPicker>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Paso 5 · Reloj (Strava)
// ---------------------------------------------------------------------------

function WatchStep({ stravaError, onSkip }: { stravaError: boolean; onSkip: () => void }) {
    const [connecting, setConnecting] = useState(false)
    return (
        <div>
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fc4c02]/10 text-[#fc4c02]">
                <Watch className="h-6 w-6" />
            </span>
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Conecta tu reloj</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Conecta Strava y tus carreras y salidas en bici llegan solas a tu plan. Funciona con Garmin, Coros, Polar y Apple Watch.
            </p>
            {stravaError && (
                <div className="mt-5">
                    <AuthAlert tone="warning" title="No se pudo conectar Strava">
                        Vuelve a intentarlo y acepta el permiso para leer tus actividades.
                    </AuthAlert>
                </div>
            )}
            <div className="mt-7 flex flex-col gap-2.5">
                <Button
                    size="lg"
                    className="h-11 rounded-xl bg-[#fc4c02] text-[15px] font-semibold text-white hover:bg-[#e04402]"
                    onClick={() => {
                        setConnecting(true)
                        window.location.href = '/api/strava/connect?return=bienvenida'
                    }}
                    disabled={connecting}
                >
                    {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Conectar Strava
                </Button>
                <Button variant="ghost" className="h-10 rounded-xl" onClick={onSkip} disabled={connecting}>
                    No uso reloj
                </Button>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Paso 6 · Formulario del coach
// ---------------------------------------------------------------------------

function FormStep({ data }: { data: AthleteWelcomeData }) {
    const { form, coachName } = data
    return (
        <div>
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ClipboardList className="h-6 w-6" />
            </span>
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">Cuéntale a {coachName} sobre ti</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Con esto prepara tu primer plan.</p>

            {form.sections.length > 0 && (
                <ul className="mt-5 divide-y divide-border/60 rounded-2xl border border-border/70">
                    {form.sections.map(section => (
                        <li key={section.title} className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
                            <span className="font-medium">{section.title}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {section.questions} {section.questions === 1 ? 'pregunta' : 'preguntas'} · {section.minutes} min
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Se guarda solo: puedes dejarlo a medias y seguir luego.</p>

            <div className="mt-7 flex flex-col gap-2.5">
                {form.checkinId && (
                    <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                        <Link href={`/forms/${form.checkinId}`}>
                            {form.hasDraft ? 'Seguir donde lo dejé' : 'Empezar el formulario'}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                )}
                <Button asChild variant="ghost" className="h-10 rounded-xl">
                    <Link href="/chat">
                        <MessageCircle className="h-4 w-4" />
                        Escribir a {coachName}
                    </Link>
                </Button>
            </div>
        </div>
    )
}
