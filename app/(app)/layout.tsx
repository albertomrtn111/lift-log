import { BottomNav } from '@/components/layout/BottomNav'
import { ClientAppProvider } from '@/contexts/ClientAppContext'
import { DevStalenessGuard } from '@/components/debug/DevStalenessGuard'

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
                <main className="pb-20">
                    {children}
                </main>
                <BottomNav />
                <DevStalenessGuard />
            </div>
        </ClientAppProvider>
    )
}
