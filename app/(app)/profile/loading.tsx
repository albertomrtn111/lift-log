import { Skeleton } from '@/components/ui/skeleton'

export default function ProfileLoading() {
    return (
        <div className="min-h-screen">
            {/* Header skeleton */}
            <header className="sticky top-0 z-40 bg-background border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-xl" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-20" />
                            <Skeleton className="h-4 w-28" />
                        </div>
                    </div>
                </div>
            </header>
            {/* Profile card skeleton */}
            <div className="p-4">
                <div className="flex flex-col items-center gap-4 py-6">
                    <Skeleton className="w-20 h-20 rounded-full" />
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-40" />
                </div>
            </div>
            {/* Menu items skeleton */}
            <div className="px-4 space-y-2">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
            </div>
        </div>
    )
}
