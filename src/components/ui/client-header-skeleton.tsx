import { Skeleton } from '@/components/ui/skeleton'

/**
 * Cabecera de carga con las mismas medidas que las cabeceras reales del atleta
 * (antetítulo + título + subnavegación), para que no haya salto al cargar.
 */
export function ClientHeaderSkeleton({ segmented = false, children }: { segmented?: boolean; children?: React.ReactNode }) {
    return (
        <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
            <div className="px-4 pb-3 pt-4">
                <div className="flex min-h-10 flex-col justify-end gap-1.5 pr-24">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-7 w-32" />
                </div>
                {segmented && <Skeleton className="mt-3 h-11 w-full rounded-full" />}
                {children}
            </div>
        </header>
    )
}
