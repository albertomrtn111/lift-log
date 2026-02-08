import { Skeleton } from '@/components/ui/skeleton'

export default function MembersLoading() {
    return (
        <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <Skeleton className="h-9 w-32" />
            </div>

            {/* Search/filter skeleton */}
            <div className="flex gap-3">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-24" />
            </div>

            {/* Table/list skeleton */}
            <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
            </div>
        </div>
    )
}
