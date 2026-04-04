import { BottomNav } from '@/components/layout/BottomNav'
import { ClientAppProvider } from '@/contexts/ClientAppContext'
import { DevStalenessGuard } from '@/components/debug/DevStalenessGuard'
import { PwaNavigationFix } from '@/components/layout/PwaNavigationFix'
import { PushNotificationBanner } from '@/components/push/PushNotificationBanner'

export default function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Security is handled by middleware - no blocking queries here
    // This allows instant navigation between tabs
    return (
        <ClientAppProvider>
            <div className="app-mobile-shell bg-background">
                <PushNotificationBanner />
                <main className="app-mobile-main">
                    {children}
                </main>
                <PwaNavigationFix />
                <BottomNav />
                <DevStalenessGuard />
            </div>
        </ClientAppProvider>
    )
}
