import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachProvider } from '@/contexts/CoachContext'

export default function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Security is handled by middleware - no blocking queries here
    // This allows instant navigation between tabs
    return (
        <CoachProvider>
            <div className="min-h-screen bg-background flex">
                <CoachSidebar />
                <main className="flex-1 lg:pl-64">
                    {children}
                </main>
            </div>
        </CoachProvider>
    )
}
