import { cn } from '@/lib/utils'

/** Lista en tarjeta para catálogos del coach (plantillas, métricas, formularios…) */
export function CatalogList({ children, dimmed, className }: { children: React.ReactNode; dimmed?: boolean; className?: string }) {
    return (
        <ul className={cn(
            'divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
            dimmed && 'pointer-events-none opacity-60',
            className
        )}>
            {children}
        </ul>
    )
}

export function CatalogEmpty({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
    return (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
        </div>
    )
}

/** Píldora Activa/Inactiva con punto de color */
export function StatusPill({ active, activeLabel = 'Activa', inactiveLabel = 'Inactiva' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
    return (
        <span className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
        )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-success' : 'bg-muted-foreground/50')} />
            {active ? activeLabel : inactiveLabel}
        </span>
    )
}
