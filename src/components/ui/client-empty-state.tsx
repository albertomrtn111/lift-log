import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ClientEmptyStateProps {
    icon: React.ElementType
    title: string
    description?: ReactNode
    /** Acción opcional (botón o enlace) bajo el texto */
    children?: ReactNode
    className?: string
}

/** Estado vacío de las pantallas del atleta: icono en pastilla tintada, título y explicación */
export function ClientEmptyState({ icon: Icon, title, description, children, className }: ClientEmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center rounded-3xl border border-border/60 bg-card/60 px-6 py-12 text-center', className)}>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <Icon className="h-6 w-6" strokeWidth={1.9} />
            </div>
            <p className="text-[15px] font-semibold tracking-tight text-foreground">{title}</p>
            {description && (
                <p className="mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-muted-foreground">{description}</p>
            )}
            {children && <div className="mt-5">{children}</div>}
        </div>
    )
}
