import Link from 'next/link'
import { CoachNotificationsBell } from '@/components/coach/notifications/CoachNotificationsBell'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CoachPageHeaderProps {
    /** Sección del menú a la que pertenece la pantalla (Operativa, Configuración…) */
    eyebrow: string
    title: string
    description?: React.ReactNode
    /** Botones a la derecha del título */
    actions?: React.ReactNode
    /** Contenido bajo el título dentro de la cabecera fija (pestañas, filtros…) */
    children?: React.ReactNode
    /** Sin sticky: para pantallas que gestionan su propio alto (mensajes) */
    static?: boolean
    /** Botón redondo de volver a la izquierda del título */
    backHref?: string
    className?: string
}

/**
 * Cabecera estándar de las pantallas de coach: misma jerarquía que la app del
 * atleta (sección en versalitas + título grande) y acciones alineadas a la derecha.
 */
export function CoachPageHeader({
    eyebrow,
    title,
    description,
    actions,
    children,
    static: isStatic,
    backHref,
    className,
}: CoachPageHeaderProps) {
    return (
        <header
            className={cn(
                'nt-glass z-40 shrink-0 border-b border-border/60',
                !isStatic && 'sticky top-0',
                className
            )}
        >
            <div className="px-4 pb-4 pt-4 lg:px-8 lg:pb-6 lg:pt-8">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                    {backHref && (
                        <Link
                            href={backHref}
                            aria-label="Volver"
                            className="-ml-1 mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-foreground/15 transition-colors hover:border-foreground/40"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="nt-eyebrow nt-eyebrow-line text-muted-foreground">{eyebrow}</p>
                        <h1 className="nt-display mt-2 truncate text-[1.75rem] text-foreground lg:text-[2.5rem]">{title}</h1>
                        {description && (
                            <p className="mt-2 hidden max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:block">{description}</p>
                        )}
                    </div>
                    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
                    {/* En móvil no hay barra lateral: la campana vive en la cabecera */}
                    <CoachNotificationsBell className="self-start lg:hidden" />
                </div>
                {children && <div className="mt-4 lg:mt-5">{children}</div>}
            </div>
        </header>
    )
}

/** Estado de carga con la cabecera real, para que no salte al terminar de cargar */
export function CoachPageSkeleton({ eyebrow, title, rows = 6 }: { eyebrow: string; title: string; rows?: number }) {
    return (
        <div className="min-h-screen pb-20 lg:pb-6">
            <CoachPageHeader eyebrow={eyebrow} title={title} />
            <div className="space-y-3 px-4 pt-4 lg:px-8 lg:pt-6">
                <div className="flex gap-2">
                    <div className="h-10 flex-1 animate-pulse rounded-full bg-muted" />
                    <div className="h-10 w-24 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70">
                    {Array.from({ length: rows }, (_, index) => (
                        <div key={index} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
                            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
