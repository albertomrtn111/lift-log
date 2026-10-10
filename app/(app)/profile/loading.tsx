import { Skeleton } from '@/components/ui/skeleton'
import { ClientPageHeader } from '@/components/profile/settings-list'

export default function ProfileLoading() {
    return (
        <div className="app-mobile-page min-h-screen pb-6">
            <ClientPageHeader eyebrow="Cuenta" title="Perfil" />
            <div className="space-y-6 px-4 pt-5">
                <div className="flex flex-col items-center gap-2">
                    <Skeleton className="h-24 w-24 rounded-full" />
                    <Skeleton className="mt-1 h-5 w-36" />
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="mt-1 h-9 w-32 rounded-full" />
                </div>
                <Skeleton className="h-36 rounded-2xl" />
                <Skeleton className="h-44 rounded-2xl" />
            </div>
        </div>
    )
}
