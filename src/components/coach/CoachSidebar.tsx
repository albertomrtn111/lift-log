'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Users,
    Calendar,
    UserCog,
    Settings2,
    User,
    LogOut,
    FileText,
    ClipboardList,
    BarChart2,
    Receipt
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ModeSwitch } from '@/components/layout/ModeSwitch'
import { createClient } from '@/lib/supabase/client'
import { useCoachContext } from '@/contexts/CoachContext'

interface NavItem {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    badgeKey?: 'dashboardPending' | 'membersPendingSignup'
}

const navSections = [
    {
        title: 'OPERATIVA',
        items: [
            { href: '/coach/dashboard', icon: LayoutDashboard, label: 'Dashboard', badgeKey: 'dashboardPending' as const },
            { href: '/coach/calendar', icon: Calendar, label: 'Calendario' },
            { href: '/coach/clients', icon: UserCog, label: 'Workspace' },
        ]
    },
    {
        title: 'FACTURACIÓN',
        items: [
            { href: '/coach/billing', icon: Receipt, label: 'Facturación' },
        ]
    },
    {
        title: 'CONFIGURACIÓN',
        items: [
            { href: '/coach/templates', icon: FileText, label: 'Plantillas' },
            { href: '/coach/metrics', icon: BarChart2, label: 'Métricas' },
            { href: '/coach/forms', icon: ClipboardList, label: 'Formularios' },
        ]
    }
]

const accountSection = {
    title: 'CUENTA',
    items: [
        { href: '/coach/members', icon: Users, label: 'Miembros', badgeKey: 'membersPendingSignup' as const },
        { href: '/coach/profile', icon: User, label: 'Perfil' }
    ]
}

const allNavItems: NavItem[] = [
    ...navSections[0].items,
    ...navSections[1].items,
    { href: '/coach/profile', icon: User, label: 'Perfil' }
]


export function CoachSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [loggingOut, setLoggingOut] = useState(false)
    const [badges, setBadges] = useState<Record<string, number>>({})

    // Fetch sidebar badges
    useEffect(() => {
        async function fetchBadges() {
            try {
                const res = await fetch('/api/sidebar-badges')
                if (res.ok) setBadges(await res.json())
            } catch { /* silent */ }
        }
        fetchBadges()
        const interval = setInterval(fetchBadges, 60_000)
        return () => clearInterval(interval)
    }, [])

    // Get user context from cached provider
    const { coach } = useCoachContext()
    const userRole = coach?.role ?? 'coach'

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
        } catch (error) {
            console.error('Error signing out:', error)
            setLoggingOut(false)
        }
    }

    return (
        <>
            {/* Mobile overlay */}
            <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm hidden" />

            {/* Sidebar */}
            <aside
                className={cn(
                    'fixed left-0 top-0 z-50 h-full border-r border-sidebar-border/80 bg-sidebar/95 text-sidebar-foreground shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:shadow-[0_28px_70px_-36px_rgba(2,6,23,0.95)]',
                    'w-64',
                    'hidden lg:block'
                )}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex items-center gap-3 border-b border-border p-4">
                        <div className="w-10 h-10 flex items-center justify-center shrink-0">
                            <Image
                                src="/Logo_nexttrain.png"
                                alt="NexTrain"
                                width={40}
                                height={40}
                                className="object-contain"
                                priority
                            />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg">NexTrain</h1>
                            <p className="text-xs text-muted-foreground">Coach Portal</p>
                        </div>
                    </div>

                    {/* Navigation - Scrollable Area */}
                    <div className="flex-1 overflow-y-auto py-4">
                        {navSections.map((section, idx) => (
                            <div key={section.title} className={cn("px-3", idx > 0 ? "mt-6 pt-4 border-t border-border/50" : "")}>
                                <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {section.title}
                                </h3>
                                <nav className="space-y-1">
                                    {section.items.map((item) => {
                                        const isActive = pathname?.startsWith(item.href)
                                        const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                prefetch={true}
                                                className={cn(
                                                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                                                    'hover:bg-muted/50',
                                                    isActive && 'bg-primary/10 text-primary font-medium'
                                                )}
                                            >
                                                <div className="relative shrink-0">
                                                    <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                                                    {badgeCount > 0 && (
                                                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                                                            {badgeCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <span>{item.label}</span>
                                            </Link>
                                        )
                                    })}
                                </nav>
                            </div>
                        ))}
                    </div>

                    {/* Account Section & Bottom Actions (Sticky) */}
                    <div className="mt-auto border-t border-sidebar-border/70 bg-sidebar/90 px-3 pb-2 pt-4 backdrop-blur-xl">
                        <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {accountSection.title}
                        </h3>
                        <nav className="space-y-1 mb-2">
                            {accountSection.items.map((item) => {
                                const isActive = pathname?.startsWith(item.href)

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        prefetch={true}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                                            'hover:bg-muted/50',
                                            isActive && 'bg-primary/10 text-primary font-medium'
                                        )}
                                    >
                                        <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </nav>

                        {/* Mode Switch (only if user has both roles) */}
                        {userRole === 'both' && (
                            <div className="pt-2 border-t border-border/50 mt-2">
                                <ModeSwitch role={userRole} currentMode="coach" variant="toggle" />
                            </div>
                        )}

                        {/* Settings & Logout buttons */}
                        <div className="pt-2 border-t border-border/50 mt-2 flex flex-col gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start"
                                asChild
                            >
                                <Link href="/coach/settings" prefetch={true}>
                                    <Settings2 className="mr-2 h-4 w-4" />
                                    Ajustes
                                </Link>
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={handleLogout}
                                disabled={loggingOut}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
                            </Button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Mobile bottom nav */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card">
                <div className="flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
                    {allNavItems.map((item) => {
                        const isActive = pathname?.startsWith(item.href)

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                prefetch={true}
                                className={cn(
                                    'nav-item flex-1 max-w-[80px]',
                                    isActive && 'nav-item-active'
                                )}
                            >
                                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </>
    )
}
