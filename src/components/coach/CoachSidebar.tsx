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
    LogOut,
    FileText,
    ClipboardList,
    BarChart2,
    Receipt,
    MessageCircle,
    MoreHorizontal,
} from 'lucide-react'
import { useCallback, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ModeSwitch } from '@/components/layout/ModeSwitch'
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { useCoachContext } from '@/contexts/CoachContext'
import { COACH_BADGES_CHANGED_EVENT, type CoachBadgesChangedDetail } from '@/lib/coach-badges-events'

interface NavItem {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    badgeKey?: 'dashboardPending' | 'membersPendingSignup' | 'messagesUnread'
}

const navSections = [
    {
        title: 'OPERATIVA',
        items: [
            { href: '/coach/dashboard', icon: LayoutDashboard, label: 'Dashboard', badgeKey: 'dashboardPending' as const },
            { href: '/coach/messages', icon: MessageCircle, label: 'Mensajes', badgeKey: 'messagesUnread' as const },
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
        { href: '/coach/members', icon: Users, label: 'Atletas', badgeKey: 'membersPendingSignup' as const },
    ]
}

const mobilePrimaryItems: NavItem[] = navSections[0].items

const mobileSecondarySections: Array<{ title: string; items: NavItem[] }> = [
    {
        title: 'Gestión',
        items: [
            ...accountSection.items,
            ...navSections[1].items,
        ],
    },
    {
        title: 'Herramientas',
        items: [
            ...navSections[2].items,
            { href: '/coach/settings', icon: Settings2, label: 'Ajustes' },
        ],
    },
]

const mobileSecondaryItems = mobileSecondarySections.flatMap(section => section.items)

export function CoachSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [loggingOut, setLoggingOut] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [badges, setBadges] = useState<Record<string, number>>({})

    const fetchBadges = useCallback(async () => {
        try {
            const res = await fetch('/api/sidebar-badges', { cache: 'no-store' })
            if (res.ok) setBadges(await res.json())
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        fetchBadges()
        const interval = setInterval(fetchBadges, 60_000)
        return () => clearInterval(interval)
    }, [fetchBadges])

    useEffect(() => {
        const handleBadgesChanged = (event: Event) => {
            const detail = (event as CustomEvent<CoachBadgesChangedDetail>).detail
            if (typeof detail?.messagesUnreadDelta === 'number') {
                setBadges(prev => ({
                    ...prev,
                    messagesUnread: Math.max(0, (prev.messagesUnread ?? 0) + detail.messagesUnreadDelta!),
                }))
            }

            window.setTimeout(fetchBadges, 300)
        }

        window.addEventListener(COACH_BADGES_CHANGED_EVENT, handleBadgesChanged)
        return () => window.removeEventListener(COACH_BADGES_CHANGED_EVENT, handleBadgesChanged)
    }, [fetchBadges])

    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathname])

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

    const isSecondaryRouteActive = mobileSecondaryItems.some(item => pathname?.startsWith(item.href))
    const secondaryBadgeCount = accountSection.items.reduce((total, item) => {
        return total + (item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0)
    }, 0)

    return (
        <>
            {/* Sidebar */}
            <aside
                className={cn(
                    'fixed left-0 top-0 z-50 h-full border-r border-sidebar-border/80 bg-sidebar/95 text-sidebar-foreground shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:shadow-[0_28px_70px_-36px_rgba(2,6,23,0.95)]',
                    'hidden w-64 lg:block'
                )}
            >
                <div className="flex h-full flex-col">
                    {/* Logo */}
                    <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:bg-white">
                            <Image
                                src="/Logo_nexttrain.png"
                                alt="NexTrain"
                                fill
                                sizes="36px"
                                className="object-cover"
                                priority
                            />
                        </div>
                        <div className="min-w-0 leading-none">
                            <h1 className="text-[1.0625rem] font-bold tracking-tight text-foreground">NexTrain</h1>
                            <p className="mt-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground/90">
                                Coach Portal
                            </p>
                        </div>
                    </div>

                    {/* Navigation - Scrollable Area */}
                    <div className="flex-1 overflow-y-auto py-4">
                        {navSections.map((section, idx) => (
                            <div key={section.title} className={cn('px-3', idx > 0 ? 'mt-6 border-t border-border/50 pt-4' : '')}>
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
                                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50',
                                                    isActive && 'bg-primary/10 font-medium text-primary'
                                                )}
                                            >
                                                <div className="relative shrink-0">
                                                    <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                                                    {badgeCount > 0 && (
                                                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                                                            {badgeCount > 99 ? '99+' : badgeCount}
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
                        <nav className="mb-2 space-y-1">
                            {accountSection.items.map((item) => {
                                const isActive = pathname?.startsWith(item.href)
                                const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        prefetch={true}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50',
                                            isActive && 'bg-primary/10 font-medium text-primary'
                                        )}
                                    >
                                        <div className="relative shrink-0">
                                            <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                                            {badgeCount > 0 && (
                                                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                                                    {badgeCount > 99 ? '99+' : badgeCount}
                                                </span>
                                            )}
                                        </div>
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </nav>

                        {userRole === 'both' && (
                            <div className="mt-2 border-t border-border/50 pt-2">
                                <ModeSwitch role={userRole} currentMode="coach" variant="toggle" />
                            </div>
                        )}

                        <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
                            <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
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

            {/* Mobile bottom navigation: four primary actions and one overflow menu. */}
            <nav
                aria-label="Navegación principal del coach"
                className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card/95 shadow-[0_-16px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:hidden"
            >
                <div className="grid grid-cols-5 items-stretch pb-[var(--safe-area-bottom)] pl-[calc(var(--safe-area-left)+0.25rem)] pr-[calc(var(--safe-area-right)+0.25rem)] pt-1">
                    {mobilePrimaryItems.map((item) => {
                        const isActive = pathname?.startsWith(item.href)
                        const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                prefetch={true}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    isActive && 'text-primary'
                                )}
                            >
                                <span className={cn(
                                    'relative flex h-7 w-10 items-center justify-center rounded-full transition-colors',
                                    isActive && 'bg-primary/10'
                                )}>
                                    <item.icon className="h-[21px] w-[21px]" />
                                    {badgeCount > 0 && (
                                        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                                            {badgeCount > 99 ? '99+' : badgeCount}
                                        </span>
                                    )}
                                </span>
                                <span className="max-w-full truncate text-[10px] font-semibold leading-none">
                                    {item.label}
                                </span>
                            </Link>
                        )
                    })}

                    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <button
                                type="button"
                                aria-label="Abrir más opciones"
                                aria-current={isSecondaryRouteActive ? 'page' : undefined}
                                className={cn(
                                    'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    (isSecondaryRouteActive || mobileMenuOpen) && 'text-primary'
                                )}
                            >
                                <span className={cn(
                                    'relative flex h-7 w-10 items-center justify-center rounded-full transition-colors',
                                    (isSecondaryRouteActive || mobileMenuOpen) && 'bg-primary/10'
                                )}>
                                    <MoreHorizontal className="h-[22px] w-[22px]" />
                                    {secondaryBadgeCount > 0 && (
                                        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                                            {secondaryBadgeCount > 99 ? '99+' : secondaryBadgeCount}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[10px] font-semibold leading-none">Más</span>
                            </button>
                        </SheetTrigger>

                        <SheetContent
                            side="bottom"
                            className="max-h-[78dvh] overflow-y-auto rounded-t-3xl pb-[calc(var(--safe-area-bottom)+1.25rem)] pl-[calc(var(--safe-area-left)+1rem)] pr-[calc(var(--safe-area-right)+1rem)] pt-5"
                        >
                            <SheetHeader className="pr-12 text-left">
                                <SheetTitle>Más opciones</SheetTitle>
                                <SheetDescription>
                                    Accede al resto de herramientas del portal de coach.
                                </SheetDescription>
                            </SheetHeader>

                            <div className="mt-5 space-y-5">
                                {mobileSecondarySections.map(section => (
                                    <section key={section.title}>
                                        <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {section.title}
                                        </h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            {section.items.map(item => {
                                                const isActive = pathname?.startsWith(item.href)
                                                const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0

                                                return (
                                                    <SheetClose asChild key={item.href}>
                                                        <Link
                                                            href={item.href}
                                                            prefetch={true}
                                                            aria-current={isActive ? 'page' : undefined}
                                                            className={cn(
                                                                'flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-3 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                                                isActive && 'border-primary/30 bg-primary/10 text-primary'
                                                            )}
                                                        >
                                                            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                                                <item.icon className="h-5 w-5" />
                                                                {badgeCount > 0 && (
                                                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                                                                        {badgeCount > 99 ? '99+' : badgeCount}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className="min-w-0 truncate">{item.label}</span>
                                                        </Link>
                                                    </SheetClose>
                                                )
                                            })}
                                        </div>
                                    </section>
                                ))}

                                {userRole === 'both' && (
                                    <div className="border-t border-border/70 pt-4">
                                        <ModeSwitch role={userRole} currentMode="coach" variant="toggle" />
                                    </div>
                                )}

                                <Button
                                    variant="ghost"
                                    className="h-12 w-full justify-start rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={handleLogout}
                                    disabled={loggingOut}
                                >
                                    <LogOut className="mr-2 h-5 w-5" />
                                    {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </nav>
        </>
    )
}
