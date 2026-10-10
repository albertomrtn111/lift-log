import Link from 'next/link'
import { ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Grupo de filas tipo ajustes de iOS: título opcional, tarjeta y nota al pie */
export function SettingsGroup({
    title,
    footer,
    children,
    className,
}: {
    title?: string
    footer?: React.ReactNode
    children: React.ReactNode
    className?: string
}) {
    return (
        <section className={className}>
            {title && (
                <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            )}
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                {children}
            </div>
            {footer && <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">{footer}</p>}
        </section>
    )
}

/** Cuadro de icono con color de acento */
export function SettingsIcon({ icon: Icon, tone = 'bg-primary/10 text-primary', spinning }: { icon: React.ElementType; tone?: string; spinning?: boolean }) {
    return (
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>
            <Icon className={cn('h-[18px] w-[18px]', spinning && 'animate-spin')} />
        </span>
    )
}

interface SettingsRowProps {
    icon?: React.ElementType
    iconTone?: string
    title: string
    description?: React.ReactNode
    /** Contenido a la derecha (switch, valor, badge…) */
    trailing?: React.ReactNode
    href?: string
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
    destructive?: boolean
    showChevron?: boolean
}

export function SettingsRow({
    icon,
    iconTone,
    title,
    description,
    trailing,
    href,
    onClick,
    loading,
    disabled,
    destructive,
    showChevron,
}: SettingsRowProps) {
    const interactive = Boolean(href || onClick)
    const chevron = showChevron ?? interactive

    const content = (
        <>
            {icon && (
                <SettingsIcon
                    icon={loading ? Loader2 : icon}
                    spinning={loading}
                    tone={destructive ? 'bg-destructive/10 text-destructive' : iconTone}
                />
            )}
            <span className="min-w-0 flex-1">
                <span className={cn('block text-[15px] font-medium leading-tight', destructive ? 'text-destructive' : 'text-foreground')}>
                    {title}
                </span>
                {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}
            </span>
            {trailing}
            {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
        </>
    )

    const className = cn(
        'flex min-h-[3.5rem] w-full items-center gap-3 px-3.5 py-2.5 text-left',
        interactive && 'transition-colors hover:bg-muted/50 active:bg-muted/70',
        disabled && 'pointer-events-none opacity-60'
    )

    if (href) {
        return <Link href={href} className={className}>{content}</Link>
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} disabled={disabled} className={className}>
                {content}
            </button>
        )
    }
    return <div className={className}>{content}</div>
}

/** Cabecera estándar de las pantallas del cliente (eyebrow + título grande) */
export function ClientPageHeader({
    eyebrow,
    title,
    leading,
    children,
}: {
    eyebrow: string
    title: string
    leading?: React.ReactNode
    children?: React.ReactNode
}) {
    return (
        <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
            <div className="px-4 pb-3 pt-4">
                <div className="flex min-h-10 items-end gap-3 pr-24">
                    {leading}
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
                        <h1 className="truncate text-2xl font-bold leading-tight tracking-tight text-foreground">{title}</h1>
                    </div>
                </div>
                {children}
            </div>
        </header>
    )
}
