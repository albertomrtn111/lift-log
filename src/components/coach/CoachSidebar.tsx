'use client'

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
    Dumbbell,
    Receipt,
    MessageCircle,
    MoreHorizontal,
    LineChart,
} from 'lucide-react'
import { useCallback, useState, useEffect } from 'react'
import { LogoMark, SpaceLogo } from '@/components/brand/LogoMark'
import { useSpaceBranding } from '@/components/brand/SpaceBrandingContext'
import { WorkspaceSwitcher } from '@/components/coach/WorkspaceSwitcher'
import type { Workspace } from '@/lib/auth/active-coach'
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
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'
import { CoachNotificationsBell } from '@/components/coach/notifications/CoachNotificationsBell'

interface NavItem {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    badgeKey?: 'dashboardPending' | 'membersPendingSignup' | 'messagesUnread'
}

// Mismos grupos en la barra lateral, en el menú «Más» del móvil y en las
// cabeceras de cada pantalla (CoachPageHeader eyebrow)
const navSections: Array<{ title: string; items: NavItem[] }> = [
    {
        title: 'Operativa',
        items: [
            { href: '/coach/dashboard', icon: LayoutDashboard, label: 'Dashboard', badgeKey: 'dashboardPending' as const },
            { href: '/coach/messages', icon: MessageCircle, label: 'Mensajes', badgeKey: 'messagesUnread' as const },
            { href: '/coach/calendar', icon: Calendar, label: 'Calendario' },
            { href: '/coach/clients', icon: UserCog, label: 'Workspace' },
        ]
    },
    {
        title: 'Gestión',
        items: [
            { href: '/coach/members', icon: Users, label: 'Atletas', badgeKey: 'membersPendingSignup' as const },
            { href: '/coach/billing', icon: Receipt, label: 'Facturación' },
        ]
    },
    {
        title: 'Herramientas',
        items: [
            { href: '/coach/templates', icon: FileText, label: 'Plantillas' },
            { href: '/coach/metrics', icon: BarChart2, label: 'Métricas' },
            { href: '/coach/forms', icon: ClipboardList, label: 'Formularios' },
            { href: '/coach/analytics', icon: LineChart, label: 'Analítica' },
        ]
    }
]

const mobilePrimaryItems: NavItem[] = navSections[0].items

const mobileSecondarySections: Array<{ title: string; items: NavItem[] }> = [
    navSections[1],
    navSections[2],
    {
        title: 'Cuenta',
        items: [
            { href: '/coach/settings', icon: Settings2, label: 'Ajustes' },
        ],
    },
]

const mobileSecondaryItems = mobileSecondarySections.flatMap(section => section.items)

const STUDIO_NAV_ITEM: NavItem = { href: '/coach/sala', icon: Dumbbell, label: 'Sala' }

export function CoachSidebar({ workspaces, studioEnabled }: { workspaces: Workspace[]; studioEnabled: boolean }) {
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
    const brand = useSpaceBranding()
    const desktopSections = studioEnabled
        ? navSections.map((section, index) => (index === 0 ? { ...section, items: [STUDIO_NAV_ITEM, ...section.items] } : section))
        : navSections
    const moreSections = studioEnabled
        ? [{ title: 'Sala', items: [STUDIO_NAV_ITEM] }, ...mobileSecondarySections]
        : mobileSecondarySections
    const userRole = coach?.role ?? 'coach'
    const coachId = coach?.coachId ?? null

    // Al volver a la pestaña no se espera al siguiente sondeo de 60 s
    useResyncOnReturn(fetchBadges)

    // Mensajes de atletas en vivo: el contador de Mensajes se actualiza en
    // cualquier pantalla del coach, no solo en la bandeja.
    useEffect(() => {
        if (!coachId) return
        const supabase = createClient()
        let timer: ReturnType<typeof setTimeout> | undefined
        const refetchSoon = () => {
            clearTimeout(timer)
            timer = setTimeout(fetchBadges, 400)
        }

        const channel = supabase
            .channel(uniqueChannelName(`coach-badges:${coachId}`))
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                if ((payload.new as { sender_role?: string }).sender_role === 'client') refetchSoon()
            })
            .subscribe(resyncOnResubscribe(fetchBadges))

        return () => {
            clearTimeout(timer)
            supabase.removeChannel(channel)
        }
    }, [coachId, fetchBadges])

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            const supabase = createClient()
            await supabase.auth.signOut({ scope: 'local' })
            router.push('/login')
            router.refresh()
        } catch (error) {
            console.error('Error signing out:', error)
            setLoggingOut(false)
        }
    }

    const isSecondaryRouteActive = moreSections.flatMap(section => section.items).some(item => pathname?.startsWith(item.href))
    const secondaryBadgeCount = mobileSecondaryItems.reduce((total, item) => {
        return total + (item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0)
    }, 0)

    const countLabel = (count: number) => (count > 99 ? '99+' : String(count))

    return (
        <>
            {/* Barra lateral: tinta en los dos temas, como la web. `dark` hace que
                todo lo de dentro (campana, selector de espacio) use sus colores oscuros. */}
            <aside
                className="dark fixed left-0 top-0 z-50 hidden h-full w-64 border-r border-white/[0.07] bg-[#0B0D12] text-white lg:block"
            >
                <div className="flex h-full flex-col">
                    <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
                        {brand?.logoLightUrl ? (
                            // Con logo del espacio, el logo ya dice el nombre: no se repite en texto.
                            <div className="min-w-0 flex-1">
                                <SpaceLogo
                                    lightUrl={brand.logoDarkUrl ?? brand.logoLightUrl}
                                    darkUrl={brand.logoDarkUrl}
                                    alt={brand.displayName ?? ''}
                                    className="h-8 max-w-[150px]"
                                />
                                <p className="nt-eyebrow mt-2 whitespace-nowrap text-[9.5px] text-white/40">con NexTrain</p>
                            </div>
                        ) : (
                            <>
                                <LogoMark className="h-7 text-white" arrowClassName="fill-brand-light stroke-brand-light" />
                                <div className="min-w-0 flex-1 leading-none">
                                    <p className="nt-title truncate text-[1.15rem] text-white">
                                        {brand?.displayName ?? <>Nex<span className="text-white/55">Train</span></>}
                                    </p>
                                    {brand && <p className="nt-eyebrow mt-1.5 whitespace-nowrap text-[9.5px] text-white/40">con NexTrain</p>}
                                </div>
                            </>
                        )}
                        <CoachNotificationsBell className="ml-auto shrink-0 border-white/10 bg-white/[0.04] hover:bg-white/10" />
                    </div>

                    {workspaces.length > 1 && (
                        <div className="px-3 pb-2">
                            <WorkspaceSwitcher workspaces={workspaces} />
                        </div>
                    )}

                    <nav aria-label="Navegación del coach" className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
                        {desktopSections.map((section, idx) => (
                            <div key={section.title} className={cn(idx > 0 && 'mt-6')}>
                                <p className="nt-eyebrow mb-2 px-3 text-[10px] text-white/35">{section.title}</p>
                                <div className="space-y-0.5">
                                    {section.items.map((item) => {
                                        const isActive = pathname?.startsWith(item.href)
                                        const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                prefetch={true}
                                                aria-current={isActive ? 'page' : undefined}
                                                className={cn(
                                                    'group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-white/60 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                                                    isActive && 'bg-white text-[#0B0D12] hover:bg-white hover:text-[#0B0D12]'
                                                )}
                                            >
                                                <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-[#0058D8]' : 'text-white/45 group-hover:text-white/80')} />
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                {badgeCount > 0 && (
                                                    <span className={cn(
                                                        'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                                                        isActive ? 'bg-[#0B0D12] text-white' : 'bg-destructive text-white'
                                                    )}>
                                                        {countLabel(badgeCount)}
                                                    </span>
                                                )}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    <div className="border-t border-white/[0.07] px-3 pb-4 pt-3">
                        {userRole === 'both' && (
                            <div className="mb-2 border-b border-white/[0.07] pb-2">
                                <ModeSwitch role={userRole} currentMode="coach" variant="toggle" />
                            </div>
                        )}
                        <Link
                            href="/coach/settings"
                            prefetch={true}
                            aria-current={pathname?.startsWith('/coach/settings') ? 'page' : undefined}
                            className={cn(
                                'flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white',
                                pathname?.startsWith('/coach/settings') && 'bg-white text-[#0B0D12] hover:bg-white hover:text-[#0B0D12]'
                            )}
                        >
                            <Settings2 className="h-[18px] w-[18px]" />
                            Ajustes
                        </Link>
                        <button
                            type="button"
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-white/45 transition-colors hover:bg-white/[0.06] hover:text-red-300 disabled:opacity-60"
                        >
                            <LogOut className="h-[18px] w-[18px]" />
                            {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Móvil: dock flotante de tinta con cuatro accesos y «Más», como el de la web. */}
            <nav
                aria-label="Navegación principal del coach"
                className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(var(--safe-area-bottom)+0.625rem)] pl-[calc(var(--safe-area-left)+0.75rem)] pr-[calc(var(--safe-area-right)+0.75rem)] lg:hidden"
            >
                <div className="dark mx-auto grid max-w-md grid-cols-5 gap-0.5 rounded-full bg-[#0B0D12]/[0.92] p-1.5 shadow-[0_20px_50px_-12px_rgba(11,13,18,0.65)] ring-1 ring-white/10 backdrop-blur-xl">
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
                                    'relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-full px-0.5 text-white/55 transition-[color,background-color,transform] duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                                    isActive && 'bg-white text-[#0B0D12]'
                                )}
                            >
                                <span className="relative">
                                    <item.icon className={cn('h-5 w-5', isActive && 'text-[#0058D8]')} />
                                    {badgeCount > 0 && (
                                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9.5px] font-bold leading-none text-white ring-2 ring-[#0B0D12]">
                                            {countLabel(badgeCount)}
                                        </span>
                                    )}
                                </span>
                                <span className="max-w-full truncate text-[10.5px] font-semibold leading-none">{item.label}</span>
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
                                    'relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-full px-0.5 text-white/55 transition-[color,background-color,transform] duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                                    (isSecondaryRouteActive || mobileMenuOpen) && 'bg-white text-[#0B0D12]'
                                )}
                            >
                                <span className="relative">
                                    <MoreHorizontal className="h-5 w-5" />
                                    {secondaryBadgeCount > 0 && (
                                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9.5px] font-bold leading-none text-white ring-2 ring-[#0B0D12]">
                                            {countLabel(secondaryBadgeCount)}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[10.5px] font-semibold leading-none">Más</span>
                            </button>
                        </SheetTrigger>

                        <SheetContent
                            side="bottom"
                            className="max-h-[80dvh] overflow-y-auto rounded-t-[28px] pb-[calc(var(--safe-area-bottom)+1.25rem)] pl-[calc(var(--safe-area-left)+1rem)] pr-[calc(var(--safe-area-right)+1rem)] pt-6"
                        >
                            <SheetHeader className="pr-12 text-left">
                                <p className="nt-eyebrow text-muted-foreground">Portal del coach</p>
                                <SheetTitle className="nt-display text-[1.75rem]">Más opciones</SheetTitle>
                                {workspaces.length > 1 && <WorkspaceSwitcher workspaces={workspaces} />}
                                <SheetDescription className="sr-only">
                                    Accede al resto de herramientas del portal de coach.
                                </SheetDescription>
                            </SheetHeader>

                            <div className="mt-5 space-y-6">
                                {moreSections.map(section => (
                                    <section key={section.title}>
                                        <h3 className="nt-eyebrow mb-2.5 px-1 text-muted-foreground">{section.title}</h3>
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
                                                                'flex min-h-[3.75rem] items-center gap-3 rounded-2xl border border-border/80 bg-card px-3 py-3 text-[15px] font-medium transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                                                isActive && 'border-foreground bg-foreground text-background'
                                                            )}
                                                        >
                                                            <span className={cn('relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted', isActive && 'bg-background/15')}>
                                                                <item.icon className="h-[18px] w-[18px]" />
                                                                {badgeCount > 0 && (
                                                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9.5px] font-bold text-white">
                                                                        {countLabel(badgeCount)}
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
                                    className="h-12 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
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
