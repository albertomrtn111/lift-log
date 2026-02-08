import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
    return (
        <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
            {/* Header skeleton */}
            <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                </div>
            </div>

            {/* KPI Cards skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
            </div>

            {/* Content sections skeleton */}
            <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <Skeleton className="h-6 w-40" />
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-16 rounded-lg" />
                    ))}
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-6 w-40" />
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-16 rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    )
}
