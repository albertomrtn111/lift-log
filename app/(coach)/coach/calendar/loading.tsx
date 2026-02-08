import { Skeleton } from '@/components/ui/skeleton'

export default function CalendarLoading() {
    return (
        <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
            {/* Header skeleton */}
            <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-40" />
                </div>
            </div>

            {/* Calendar header skeleton */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-32" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                </div>
            </div>

            {/* Calendar grid skeleton */}
            <div className="grid grid-cols-7 gap-1">
                {[...Array(7)].map((_, i) => (
                    <Skeleton key={`header-${i}`} className="h-8" />
                ))}
                {[...Array(35)].map((_, i) => (
                    <Skeleton key={`cell-${i}`} className="h-20 rounded-lg" />
                ))}
            </div>
        </div>
    )
}
