import { BottomNav } from '@/components/layout/BottomNav'
import { AppTopActions } from '@/components/layout/AppTopActions'
import { ClientAppProvider } from '@/contexts/ClientAppContext'
import { DevStalenessGuard } from '@/components/debug/DevStalenessGuard'
import { PwaNavigationFix } from '@/components/layout/PwaNavigationFix'
import { PushNotificationBanner } from '@/components/push/PushNotificationBanner'
import { StravaPendingFeedback } from '@/components/strava/StravaPendingFeedback'

export default function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ClientAppProvider>
            <div className="app-mobile-shell bg-background">
                <PushNotificationBanner />
                <StravaPendingFeedback />
                <AppTopActions />
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
