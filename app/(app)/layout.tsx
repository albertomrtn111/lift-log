import { BottomNav } from '@/components/layout/BottomNav'
import { AppTopActions } from '@/components/layout/AppTopActions'
import { ClientAppProvider } from '@/contexts/ClientAppContext'
import { DevStalenessGuard } from '@/components/debug/DevStalenessGuard'
import { PwaNavigationFix } from '@/components/layout/PwaNavigationFix'
import { PushNotificationBanner } from '@/components/push/PushNotificationBanner'
import { StravaPendingFeedback } from '@/components/strava/StravaPendingFeedback'
import { AnnouncementHost } from '@/components/announcements/AnnouncementHost'
import { SpaceBranding, spaceBrandingMetadata } from '@/components/brand/SpaceBranding'
import { AthleteAppOff } from '@/components/layout/AthleteAppOff'
import { getAthleteModules } from '@/data/athlete-modules'

export const generateMetadata = spaceBrandingMetadata

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const modules = await getAthleteModules()
    if (!modules.app) return <SpaceBranding><AthleteAppOff /></SpaceBranding>

    return (
        <SpaceBranding>
            <ClientAppProvider>
                <div className="app-mobile-shell bg-background">
                    <div className="app-mobile-statusbar" aria-hidden="true" />
                    <PushNotificationBanner />
                    <StravaPendingFeedback />
                    <main className="app-mobile-main relative">
                        <AppTopActions />
                        {children}
                    </main>
                    <PwaNavigationFix />
                    <BottomNav modules={modules} />
                    <AnnouncementHost />
                    <DevStalenessGuard />
                </div>
            </ClientAppProvider>
        </SpaceBranding>
    )
}
