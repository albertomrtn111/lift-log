import { Skeleton } from '@/components/ui/skeleton'

export default function RoutineLoading() {
    return (
        <div className="app-mobile-page min-h-screen">
            <header className="app-mobile-header border-b border-border/60 bg-background">
                <div className="px-4 pb-3 pt-4">
                    <div className="space-y-2 pr-24">
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="h-7 w-48" />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                        <Skeleton className="h-10 w-44 rounded-full" />
                        <Skeleton className="h-1.5 flex-1 rounded-full" />
                    </div>
                </div>
                <div className="flex gap-2 overflow-hidden px-4 pb-3">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
                    ))}
                </div>
            </header>
            <div className="space-y-3 p-4">
                <Skeleton className="h-[92px] rounded-2xl" />
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-[88px] rounded-2xl" />
                ))}
            </div>
        </div>
    )
}
