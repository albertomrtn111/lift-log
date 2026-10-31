import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/brand/LogoMark'
import { BrandPanel } from './BrandPanel'

export const SUPPORT_EMAIL = 'hola@nexttrain.app'

export function AuthLogo({ className }: { className?: string }) {
    return (
        <Link href="/login" className={cn('flex items-center gap-2.5', className)} aria-label="NexTrain">
            <LogoMark className="h-7" />
            <span className="text-[17px] font-bold tracking-tight">NexTrain</span>
        </Link>
    )
}

interface AuthShellProps {
    children: React.ReactNode
    /** Enlace/acción en la esquina superior derecha */
    topRight?: React.ReactNode
    /** Ancho completo, sin panel de marca (selector de planes) */
    wide?: boolean
    panelTitle?: React.ReactNode
    panelText?: string
}

/**
 * Estructura común de las pantallas de acceso: formulario a la izquierda y
 * panel de marca a la derecha en escritorio; solo el formulario en móvil.
 */
export function AuthShell({ children, topRight, wide, panelTitle, panelText }: AuthShellProps) {
    return (
        <div className="flex min-h-dvh bg-background">
            <div className="flex min-h-dvh min-w-0 flex-1 flex-col px-5 pb-[max(1rem,var(--safe-area-bottom))] pt-[max(0.75rem,var(--safe-area-top))] sm:px-8 lg:px-12">
                <header className="flex h-14 shrink-0 items-center justify-between gap-4">
                    <AuthLogo />
                    {topRight && <div className="text-sm text-muted-foreground">{topRight}</div>}
                </header>

                <main className={cn('flex flex-1 justify-center py-8 sm:py-12', wide ? 'items-start' : 'items-center')}>
                    <div className={cn('w-full', wide ? 'max-w-6xl' : 'max-w-[400px]')}>{children}</div>
                </main>

                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-2 text-xs text-muted-foreground">
                    <span>© {new Date().getFullYear()} NexTrain</span>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-foreground">¿Necesitas ayuda?</a>
                </footer>
            </div>

            {!wide && <BrandPanel title={panelTitle} text={panelText} />}
        </div>
    )
}

/** Título y subtítulo de cada pantalla */
export function AuthHeading({ eyebrow, title, description, className }: {
    eyebrow?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('mb-8', className)}>
            {eyebrow && <div className="mb-3">{eyebrow}</div>}
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2rem]">{title}</h1>
            {description && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
    )
}

/** Pantalla de estado (éxito, enlace caducado, cargando…) */
export function AuthStatus({ icon: Icon, tone = 'primary', title, children, actions, spin }: {
    icon: React.ElementType
    tone?: 'primary' | 'success' | 'destructive' | 'muted'
    title: React.ReactNode
    children?: React.ReactNode
    actions?: React.ReactNode
    spin?: boolean
}) {
    const tones = {
        primary: 'bg-primary/10 text-primary ring-primary/15',
        success: 'bg-success/10 text-success ring-success/15',
        destructive: 'bg-destructive/10 text-destructive ring-destructive/15',
        muted: 'bg-muted text-muted-foreground ring-border',
    }
    return (
        <div>
            <div className={cn('mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ring-1', tones[tone])}>
                <Icon className={cn('h-6 w-6', spin && 'animate-spin')} />
            </div>
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
            {children && <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>}
            {actions && <div className="mt-8 flex flex-col gap-2.5">{actions}</div>}
        </div>
    )
}

export function AuthDivider({ children }: { children: React.ReactNode }) {
    return (
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {children}
            <span className="h-px flex-1 bg-border" />
        </div>
    )
}

/** Indicador de pasos del registro: 1. Plan → 2. Cuenta */
export function SignupSteps({ current, className }: { current: 1 | 2; className?: string }) {
    const steps = ['Plan', 'Cuenta']
    return (
        <ol className={cn('flex items-center gap-2 text-xs font-semibold', className)} aria-label="Pasos del registro">
            {steps.map((label, index) => {
                const step = index + 1
                const done = step < current
                const active = step === current
                return (
                    <li key={label} className="flex items-center gap-2">
                        {index > 0 && <span className={cn('h-px w-6 sm:w-10', done || active ? 'bg-primary/60' : 'bg-border')} />}
                        <span className={cn('flex items-center gap-1.5', active ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground')} aria-current={active ? 'step' : undefined}>
                            <span className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                                active ? 'bg-foreground text-background' : done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                            )}>
                                {done ? '✓' : step}
                            </span>
                            {label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}
