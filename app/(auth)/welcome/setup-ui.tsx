'use client'

/**
 * Piezas del primer día del coach (NXT-186): elecciones con un toque, la ficha
 * de su perfil que se escribe en vivo y la barra de capítulos.
 */

import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { DISCIPLINES } from '@/lib/onboarding/coach-options'
import { SETUP_CHAPTERS, describeMethod, initialsOf, profileCompletion, type SetupChapterId } from '@/lib/onboarding/coach-setup.js'

// ─── Encabezado de cada paso ─────────────────────────────────────────────

export function StepHeading({ eyebrow, title, description }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode }) {
    return (
        <div className="mb-8 sm:mb-10">
            {eyebrow && <div className="mb-4">{eyebrow}</div>}
            <h1 className="nt-display text-[2rem] leading-[1.05] sm:text-[2.6rem]">{title}</h1>
            {description && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">{description}</p>}
        </div>
    )
}

/** Una pregunta dentro de un paso */
export function Question({ label, hint, aside, error, children }: {
    label: React.ReactNode
    hint?: React.ReactNode
    aside?: React.ReactNode
    error?: string | null
    children: React.ReactNode
}) {
    return (
        <fieldset className="min-w-0 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
                <legend className="text-[15px] font-semibold leading-snug text-foreground">{label}</legend>
                {aside && <span className="shrink-0 text-xs text-muted-foreground">{aside}</span>}
            </div>
            {hint && <p className="-mt-1.5 text-sm text-muted-foreground">{hint}</p>}
            {children}
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </fieldset>
    )
}

// ─── Elecciones ──────────────────────────────────────────────────────────

/** Etiquetas de elección múltiple */
export function ChipGroup({ options, value, onChange, disabled }: {
    options: readonly string[]
    value: string[]
    onChange: (next: string[]) => void
    disabled?: boolean
}) {
    const toggle = (option: string) => onChange(value.includes(option) ? value.filter(item => item !== option) : [...value, option])
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(option => {
                const selected = value.includes(option)
                return (
                    <button
                        key={option}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => toggle(option)}
                        className={cn(
                            'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
                            selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card text-foreground hover:border-primary/50',
                        )}
                    >
                        {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />}
                        {option}
                    </button>
                )
            })}
        </div>
    )
}

/** Tarjetas de elección única, con una línea de ayuda */
export function ChoiceCards({ options, value, onChange, disabled, columns = 2 }: {
    options: readonly { value: string; hint?: string }[]
    value: string
    onChange: (next: string) => void
    disabled?: boolean
    columns?: 1 | 2
}) {
    return (
        <div role="radiogroup" className={cn('grid gap-2.5', columns === 2 && 'sm:grid-cols-2')}>
            {options.map(option => {
                const selected = value === option.value
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={option.hint ? `${option.value}. ${option.hint}` : option.value}
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'group relative flex min-h-[64px] items-start gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99]',
                            selected
                                ? 'border-primary bg-primary/[0.07] shadow-[0_0_0_1px_hsl(var(--primary))]'
                                : 'border-border bg-card hover:border-primary/50',
                        )}
                    >
                        <span
                            className={cn(
                                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                            )}
                            aria-hidden
                        >
                            {selected && <Check className="h-3 w-3" strokeWidth={3.5} />}
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[15px] font-semibold leading-snug">{option.value}</span>
                            {option.hint && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{option.hint}</span>}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

/** Respuesta libre que no es obligatoria: se abre solo si quiere */
export function OptionalText({ label, value, onChange, placeholder, disabled, rows = 3 }: {
    label: string
    value: string
    onChange: (next: string) => void
    placeholder?: string
    disabled?: boolean
    rows?: number
}) {
    const [open, setOpen] = useState(Boolean(value))
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
                <Plus className="h-4 w-4" />
                {label}
                <span className="font-normal text-muted-foreground">· opcional</span>
            </button>
        )
    }
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold">{label}</p>
                <span className="text-xs text-muted-foreground">Opcional</span>
            </div>
            <Textarea
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                rows={rows}
                maxLength={1500}
                disabled={disabled}
                autoFocus={!value}
                className="resize-none rounded-2xl border-border bg-card px-4 py-3 text-[15px] leading-relaxed placeholder:text-muted-foreground/70 focus-visible:ring-primary/30"
            />
        </div>
    )
}

// ─── Barra de capítulos ──────────────────────────────────────────────────

export function ChapterProgress({ chapter, chapterIndex, chapterSteps, stepInChapter }: {
    chapter: SetupChapterId
    chapterIndex: number
    chapterSteps: number
    stepInChapter: number
}) {
    return (
        <div className="w-full">
            <ol className="hidden items-center gap-2 md:flex" aria-label="Capítulos">
                {SETUP_CHAPTERS.map((item, index) => {
                    const done = index < chapterIndex
                    const current = item.id === chapter
                    const fill = done ? 100 : current ? Math.round((stepInChapter / chapterSteps) * 100) : 0
                    return (
                        <li key={item.id} className="min-w-0 flex-1" aria-current={current ? 'step' : undefined}>
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                                <span className={cn(done ? 'text-primary' : current ? 'text-foreground' : 'text-muted-foreground')}>{item.title}</span>
                                {done && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${fill}%` }} />
                            </div>
                        </li>
                    )
                })}
            </ol>
            <div className="md:hidden">
                <div className="mb-1.5 text-xs font-semibold">{SETUP_CHAPTERS[chapterIndex]?.title}</div>
                <div className="grid grid-cols-3 gap-1.5">
                    {SETUP_CHAPTERS.map((item, index) => {
                        const fill = index < chapterIndex ? 100 : index === chapterIndex ? Math.round((stepInChapter / chapterSteps) * 100) : 0
                        return (
                            <div key={item.id} className="h-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${fill}%` }} />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ─── Ficha del perfil, en vivo ───────────────────────────────────────────

export interface ProfileSnapshot {
    fullName: string
    city: string
    businessName: string
    instagram: string
    disciplines: string[]
    method: Record<string, unknown>
}

export function ProfileCard({ profile, aiEnabled, latestKey, footer, className }: {
    profile: ProfileSnapshot
    aiEnabled: boolean
    /** Frase recién escrita: se resalta un momento */
    latestKey?: string | null
    footer?: boolean
    className?: string
}) {
    const lines = describeMethod({ disciplines: profile.disciplines, method: profile.method })
    const percent = profileCompletion({ disciplines: profile.disciplines, method: profile.method, about: { fullName: profile.fullName } })
    const name = profile.businessName.trim() || profile.fullName.trim()
    const disciplineLabels = DISCIPLINES.filter(item => profile.disciplines.includes(item.id)).map(item => item.label)
    const instagram = profile.instagram.trim().replace(/^@/, '')

    return (
        <div className={cn('overflow-hidden rounded-[26px] border bg-card', className)}>
            <div className="p-6">
                <div className="flex items-center gap-3.5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0058D8,#3D8CFF)] text-lg font-semibold tracking-wide text-white">
                        {initialsOf(name || 'NexTrain')}
                    </div>
                    <div className="min-w-0">
                        <p className={cn('nt-title truncate text-[1.15rem]', !profile.businessName.trim() && 'text-muted-foreground')}>
                            {profile.businessName.trim() || 'Tu negocio'}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                            {[profile.fullName.trim() || 'Tu nombre', profile.city.trim()].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                </div>

                {(disciplineLabels.length > 0 || instagram) && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                        {disciplineLabels.map(label => (
                            <span key={label} className="nt-fade rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{label}</span>
                        ))}
                        {instagram && <span className="nt-fade rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">@{instagram}</span>}
                    </div>
                )}

                <div className="mt-6">
                    <p className="nt-eyebrow text-muted-foreground">Así trabajas</p>
                    {lines.length === 0 ? (
                        <div className="mt-3 space-y-2.5" aria-hidden>
                            <div className="h-2.5 w-11/12 rounded-full bg-muted" />
                            <div className="h-2.5 w-4/5 rounded-full bg-muted" />
                            <div className="h-2.5 w-2/3 rounded-full bg-muted" />
                        </div>
                    ) : (
                        <ul className="mt-3 space-y-2.5">
                            {lines.map(line => (
                                // La frase entra una vez; si cambia, solo se ilumina (sin volver a entrar al escribir)
                                <li key={line.key} className="nt-rise text-[14px] leading-relaxed text-foreground/90">
                                    <span key={latestKey === line.key ? line.text : 'quieta'} className={cn('block rounded-lg', latestKey === line.key && 'nt-highlight')}>
                                        {line.text}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {footer !== false && (
                <div className="border-t bg-muted/40 px-6 py-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">{aiEnabled ? 'Tu asistente te conoce' : 'Tu método, completo'}</span>
                        <span className="nt-number tabular-nums">{percent} %</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.max(percent, 3)}%` }} />
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Ejemplo de tono ─────────────────────────────────────────────────────

export function ToneSample({ athleteMessage, reply, coachInitials }: { athleteMessage: string; reply: string | null; coachInitials: string }) {
    return (
        <div className="rounded-[22px] border bg-card p-4 sm:p-5">
            <p className="nt-eyebrow mb-4 text-muted-foreground">Así respondería tu asistente</p>
            <div className="space-y-3">
                <div className="flex items-end gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">LR</span>
                    <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[14px] leading-relaxed">{athleteMessage}</p>
                </div>
                <div className="flex items-end justify-end gap-2.5">
                    {reply ? (
                        <p key={reply} className="nt-rise max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] leading-relaxed text-primary-foreground">{reply}</p>
                    ) : (
                        <p className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed px-3.5 py-2.5 text-[14px] text-muted-foreground">Elige un tono para verlo.</p>
                    )}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0058D8,#3D8CFF)] text-xs font-semibold text-white">{coachInitials}</span>
                </div>
            </div>
        </div>
    )
}
