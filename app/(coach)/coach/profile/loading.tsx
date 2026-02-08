import { Skeleton } from '@/components/ui/skeleton'

export default function ProfileLoading() {
    return (
        <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6">
            {/* Profile card skeleton */}
            <div className="flex flex-col items-center gap-4">
                <Skeleton className="w-24 h-24 rounded-full" />
                <div className="space-y-2 text-center">
                    <Skeleton className="h-6 w-40 mx-auto" />
                    <Skeleton className="h-4 w-48 mx-auto" />
                </div>
            </div>

            {/* Settings sections skeleton */}
            <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
            </div>
        </div>
    )
}
