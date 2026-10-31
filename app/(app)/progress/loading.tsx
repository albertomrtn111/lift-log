import { Skeleton } from '@/components/ui/skeleton'
import { ClientHeaderSkeleton } from '@/components/ui/client-header-skeleton'

export default function ProgressLoading() {
    return (
        <div className="app-mobile-page min-h-screen">
            <ClientHeaderSkeleton segmented />
            <div className="space-y-3 px-4 pt-4">
                <Skeleton className="h-36 rounded-2xl" />
                <Skeleton className="h-11 w-full rounded-full" />
                <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-2xl" />
                    ))}
                </div>
                <Skeleton className="h-56 rounded-2xl" />
            </div>
        </div>
    )
}
