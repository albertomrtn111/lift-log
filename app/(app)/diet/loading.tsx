import { Skeleton } from '@/components/ui/skeleton'

export default function DietLoading() {
    return (
        <div className="min-h-screen">
            {/* Header skeleton */}
            <header className="sticky top-0 z-40 bg-background border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-xl" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </div>
                </div>
            </header>
            {/* Tabs skeleton */}
            <div className="px-4 pt-4">
                <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            {/* Meals skeleton */}
            <div className="p-4 space-y-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
            </div>
        </div>
    )
}
