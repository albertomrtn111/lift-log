import { Skeleton } from '@/components/ui/skeleton'

export default function RoutineLoading() {
    return (
        <div className="min-h-screen">
            {/* Header skeleton */}
            <header className="sticky top-0 z-40 bg-background border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-4">
                        <Skeleton className="w-10 h-10 rounded-xl" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-40" />
                        </div>
                    </div>
                    {/* Week selector skeleton */}
                    <div className="flex gap-2 overflow-hidden pb-3">
                        {[...Array(6)].map((_, i) => (
                            <Skeleton key={i} className="h-10 w-10 rounded-lg flex-shrink-0" />
                        ))}
                    </div>
                    {/* Day tabs skeleton */}
                    <div className="flex gap-2 border-t pt-3">
                        {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} className="h-8 w-16" />
                        ))}
                    </div>
                </div>
            </header>
            {/* Content skeleton */}
            <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
            </div>
        </div>
    )
}
