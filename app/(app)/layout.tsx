import { BottomNav } from '@/components/layout/BottomNav'
import { ClientAppProvider } from '@/contexts/ClientAppContext'
import { DevStalenessGuard } from '@/components/debug/DevStalenessGuard'
import { PwaNavigationFix } from '@/components/layout/PwaNavigationFix'

export default function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Security is handled by middleware - no blocking queries here
    // This allows instant navigation between tabs
    return (
        <ClientAppProvider>
            <div className="min-h-screen bg-background">
                <main className="pb-24">
                    {children}
                </main>
                <PwaNavigationFix />
                <BottomNav />
                <DevStalenessGuard />
            </div>
        </ClientAppProvider>
    )
}
