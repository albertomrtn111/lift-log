import { Skeleton } from '@/components/ui/skeleton'

export default function WorkspaceLoading() {
    return (
        <div className="h-screen flex flex-col">
            {/* Client header skeleton */}
            <div className="border-b p-4">
                <div className="flex items-center gap-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                </div>
            </div>

            {/* Tabs skeleton */}
            <div className="border-b px-4">
                <div className="flex gap-4 py-3">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-20" />
                    ))}
                </div>
            </div>

            {/* Content skeleton */}
            <div className="flex-1 p-4 space-y-4 overflow-auto">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    )
}
