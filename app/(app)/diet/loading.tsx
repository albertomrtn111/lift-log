import { Skeleton } from '@/components/ui/skeleton'
import { ClientHeaderSkeleton } from '@/components/ui/client-header-skeleton'

export default function DietLoading() {
    return (
        <div className="app-mobile-page min-h-screen">
            <ClientHeaderSkeleton segmented>
                <Skeleton className="mt-2 h-11 w-full rounded-full" />
            </ClientHeaderSkeleton>
            <div className="space-y-3 px-4 pt-4">
                <Skeleton className="h-44 rounded-3xl" />
                {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
            </div>
        </div>
    )
}
