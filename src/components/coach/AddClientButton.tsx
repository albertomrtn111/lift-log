'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Check, ChevronDown, ClipboardList, Copy, Loader2, Plus, RefreshCw, Send, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { FormTemplate } from '@/types/forms'
import { toLocalDateStr } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { InviteTemplateOptions } from '@/lib/onboarding/default-templates'
import { getInviteTemplateOptionsAction, inviteAthleteAction } from './invite-athlete-actions'

interface AddClientButtonProps {
    coachId: string
    /** Se mantiene por compatibilidad; las opciones se cargan al abrir */
    formTemplates?: FormTemplate[]
    /** Abre el formulario al entrar (p. ej. desde "Primeros pasos") */
    defaultOpen?: boolean
    /** Opciones ya cargadas en el servidor (si no, se piden al abrir) */
    initialOptions?: InviteTemplateOptions
}

const NONE = '__none__'

const FREQUENCIES = [
    { days: 7, label: 'Cada semana' },
    { days: 14, label: 'Cada 2 semanas' },
    { days: 30, label: 'Cada mes' },
]

const emptyForm = () => ({
    fullName: '',
    email: '',
    onboardingTemplateId: NONE,
    reviewTemplateId: NONE,
    reviewFrequencyDays: 7,
    phone: '',
    startDate: toLocalDateStr(new Date()),
    paymentAmount: '',
    paymentDay: '',
    password: '',
})

export function AddClientButton({ coachId, defaultOpen = false, initialOptions }: AddClientButtonProps) {
    const [open, setOpen] = useState(defaultOpen)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [form, setForm] = useState(() => ({
        ...emptyForm(),
        onboardingTemplateId: initialOptions?.defaultOnboardingId ?? NONE,
        reviewTemplateId: initialOptions?.defaultReviewId ?? NONE,
    }))
    const [moreOpen, setMoreOpen] = useState(false)
    const [options, setOptions] = useState<InviteTemplateOptions | null>(initialOptions ?? null)
    const [optionsError, setOptionsError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const router = useRouter()
    const { toast } = useToast()

    const update = (patch: Partial<ReturnType<typeof emptyForm>>) => setForm(current => ({ ...current, ...patch }))

    // Al abrir, cargamos (y si hace falta creamos) los formularios por defecto
    useEffect(() => {
        if (!open || options) return
        let cancelled = false
        getInviteTemplateOptionsAction(coachId).then(result => {
            if (cancelled) return
            if (!result.success) {
                setOptionsError(result.error)
                return
            }
            setOptions(result.options)
            const review = result.options.reviews.find(option => option.id === result.options.defaultReviewId)
            setForm(current => ({
                ...current,
                onboardingTemplateId: result.options.defaultOnboardingId ?? NONE,
                reviewTemplateId: result.options.defaultReviewId ?? NONE,
                reviewFrequencyDays: review?.frequencyDays ?? 7,
            }))
        })
        return () => { cancelled = true }
    }, [open, options, coachId])

    const reset = () => {
        setForm(() => ({
            ...emptyForm(),
            onboardingTemplateId: options?.defaultOnboardingId ?? NONE,
            reviewTemplateId: options?.defaultReviewId ?? NONE,
        }))
        setError(null)
        setMoreOpen(false)
        setCopied(false)
    }

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        if (!next) {
            reset()
            // Quitamos ?invite=1 para que no se reabra al recargar
            const url = new URL(window.location.href)
            if (url.searchParams.has('invite')) {
                url.searchParams.delete('invite')
                router.replace(`${url.pathname}${url.search}`)
            }
        }
    }

    const handleGeneratePassword = () => {
        const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        const bytes = new Uint32Array(14)
        crypto.getRandomValues(bytes)
        update({ password: Array.from(bytes, n => alphabet[n % alphabet.length]).join('') })
        setCopied(false)
    }

    const handleCopyPassword = async () => {
        try {
            await navigator.clipboard.writeText(form.password)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast({ title: 'No se pudo copiar la contraseña', variant: 'destructive' })
        }
    }

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault()
        setError(null)
        if (form.password && form.password.length < 8) {
            setMoreOpen(true)
            setError('La contraseña inicial debe tener al menos 8 caracteres.')
            return
        }

        startTransition(async () => {
            const result = await inviteAthleteAction({
                coachId,
                fullName: form.fullName,
                email: form.email,
                onboardingTemplateId: form.onboardingTemplateId === NONE ? null : form.onboardingTemplateId,
                reviewTemplateId: form.reviewTemplateId === NONE ? null : form.reviewTemplateId,
                reviewFrequencyDays: form.reviewFrequencyDays,
                phone: form.phone || undefined,
                startDate: form.startDate || undefined,
                paymentAmount: form.paymentAmount ? Number(form.paymentAmount.replace(',', '.')) : undefined,
                paymentDay: form.paymentDay ? Number(form.paymentDay) : undefined,
                password: form.password || undefined,
            })

            if (!result.success) {
                setError(result.error || 'No se pudo invitar al atleta.')
                return
            }

            const firstName = form.fullName.trim().split(/\s+/)[0]
            if (result.warnings?.length) {
                toast({ title: `${firstName} está dado de alta, con avisos`, description: result.warnings.join(' '), variant: 'destructive' })
            } else {
                toast({
                    title: 'Invitación enviada',
                    description: form.password
                        ? `${firstName} ya puede entrar con su email y la contraseña inicial.`
                        : `${firstName} recibirá un email para crear su acceso. Puedes seguir sus pasos en tu panel.`,
                })
            }
            handleOpenChange(false)
            router.refresh()
        })
    }

    const selectedReview = options?.reviews.find(option => option.id === form.reviewTemplateId)

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button className="h-10 shrink-0 gap-2 px-3 sm:px-4" aria-label="Invitar atleta">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Invitar atleta</span>
                    <span className="sm:hidden">Invitar</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Invitar atleta</DialogTitle>
                    <DialogDescription>
                        Le llegará un email para crear su acceso desde el móvil.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="invite-name">Nombre</Label>
                            <Input
                                id="invite-name"
                                value={form.fullName}
                                onChange={(e) => update({ fullName: e.target.value })}
                                placeholder="Ej.: Marta García"
                                autoComplete="off"
                                required
                                autoFocus
                                disabled={isPending}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="invite-email">Email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                inputMode="email"
                                autoCapitalize="none"
                                spellCheck={false}
                                value={form.email}
                                onChange={(e) => update({ email: e.target.value })}
                                placeholder="marta@email.com"
                                autoComplete="off"
                                required
                                disabled={isPending}
                            />
                        </div>
                    </div>

                    {/* Lo que recibirá */}
                    <section aria-labelledby="invite-receives" className="rounded-xl border bg-muted/30 p-3.5">
                        <h3 id="invite-receives" className="mb-3 flex items-center gap-2 text-sm font-semibold">
                            <ClipboardList className="h-4 w-4 text-primary" />
                            Lo que recibirá
                        </h3>

                        {!options && !optionsError && (
                            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Preparando sus formularios…
                            </div>
                        )}
                        {optionsError && <p className="text-sm text-destructive">{optionsError}</p>}

                        {options && (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="invite-onboarding" className="text-xs text-muted-foreground">Formulario de onboarding · lo rellena al entrar</Label>
                                    <Select value={form.onboardingTemplateId} onValueChange={(value) => update({ onboardingTemplateId: value })} disabled={isPending}>
                                        <SelectTrigger id="invite-onboarding" className="bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.onboarding.map(option => (
                                                <SelectItem key={option.id} value={option.id}>{option.title}</SelectItem>
                                            ))}
                                            <SelectItem value={NONE}>Sin onboarding</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="invite-review" className="text-xs text-muted-foreground">Revisión periódica</Label>
                                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                        <Select
                                            value={form.reviewTemplateId}
                                            onValueChange={(value) => {
                                                const review = options.reviews.find(option => option.id === value)
                                                update({ reviewTemplateId: value, ...(review ? { reviewFrequencyDays: review.frequencyDays } : {}) })
                                            }}
                                            disabled={isPending}
                                        >
                                            <SelectTrigger id="invite-review" className="bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {options.reviews.map(option => (
                                                    <SelectItem key={option.id} value={option.id}>{option.title}</SelectItem>
                                                ))}
                                                <SelectItem value={NONE}>Sin revisión</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={String(form.reviewFrequencyDays)}
                                            onValueChange={(value) => update({ reviewFrequencyDays: Number(value) })}
                                            disabled={isPending || !selectedReview}
                                        >
                                            <SelectTrigger className="w-full bg-background sm:w-[150px]" aria-label="Frecuencia de la revisión">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FREQUENCIES.map(option => (
                                                    <SelectItem key={option.days} value={String(option.days)}>{option.label}</SelectItem>
                                                ))}
                                                {!FREQUENCIES.some(option => option.days === form.reviewFrequencyDays) && (
                                                    <SelectItem value={String(form.reviewFrequencyDays)}>Cada {form.reviewFrequencyDays} días</SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Más opciones */}
                    <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                        <CollapsibleTrigger asChild>
                            <button type="button" className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                                Más opciones
                                <span className="flex items-center gap-1 text-xs font-normal">
                                    Teléfono, fecha de inicio, cuota
                                    <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} />
                                </span>
                            </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 pt-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="invite-phone">Teléfono</Label>
                                    <Input id="invite-phone" type="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+34 600 000 000" disabled={isPending} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invite-start">Fecha de inicio</Label>
                                    <Input id="invite-start" type="date" value={form.startDate} onChange={(e) => update({ startDate: e.target.value })} disabled={isPending} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invite-fee">Cuota mensual (€)</Label>
                                    <Input id="invite-fee" inputMode="decimal" value={form.paymentAmount} onChange={(e) => update({ paymentAmount: e.target.value })} placeholder="Ej.: 80" disabled={isPending} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invite-fee-day">Día de cobro</Label>
                                    <Input id="invite-fee-day" type="number" min={1} max={31} value={form.paymentDay} onChange={(e) => update({ paymentDay: e.target.value })} placeholder="1–31" disabled={isPending} />
                                </div>
                            </div>

                            <div className="space-y-2 border-t pt-4">
                                <div className="flex items-center justify-between gap-3">
                                    <Label htmlFor="invite-password">Contraseña inicial</Label>
                                    <Button type="button" variant="ghost" size="sm" onClick={handleGeneratePassword} disabled={isPending} className="h-7 gap-1.5 text-xs">
                                        {form.password ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                                        Generar
                                    </Button>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="invite-password"
                                        name="invite-initial-password"
                                        type="text"
                                        value={form.password}
                                        onChange={(e) => update({ password: e.target.value })}
                                        placeholder="Opcional · mínimo 8 caracteres"
                                        disabled={isPending}
                                        className="pr-10 font-mono"
                                        autoComplete="off"
                                        data-form-type="other"
                                        data-1p-ignore
                                        data-lpignore="true"
                                        data-bwignore
                                    />
                                    {form.password && (
                                        <button type="button" onClick={handleCopyPassword} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 hover:bg-muted" title="Copiar contraseña">
                                            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Solo si prefieres darle tú la contraseña. Si la dejas vacía, la crea él con el enlace del email.
                                </p>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    {error && (
                        <div role="alert" className="whitespace-pre-wrap rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="submit" disabled={isPending || !options} className="w-full gap-2 sm:w-auto">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Enviar invitación
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
