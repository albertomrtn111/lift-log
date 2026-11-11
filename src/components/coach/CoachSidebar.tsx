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
    Gauge,
    Receipt,
    MessageCircle,
    MoreHorizontal,
    LineChart,
    PanelLeftClose,
    PanelLeftOpen,
    Video,
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
import { ENVIRONMENT_COOKIE, ENVIRONMENT_HOME, environmentForPath } from '@/lib/coach/environment-rules'

interface NavItem {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    badgeKey?: 'dashboardPending' | 'membersPendingSignup' | 'messagesUnread'
    /** Solo activo en su ruta exacta, no en las que cuelgan de ella. */
    exact?: boolean
}

type Environment = 'online' | 'sala'

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

const MESSAGES_ITEM = navSections[0].items[1]
const MEMBERS_ITEM = navSections[1].items[0]

// Sala es un entorno aparte: su propio menú, con lo de clientes compartido con Online.
const EVALUATIONS_ITEM: NavItem = { href: '/coach/sala/evaluaciones', icon: Gauge, label: 'Evaluaciones' }

const salaSections: Array<{ title: string; items: NavItem[] }> = [
    {
        title: 'Sala',
        items: [
            { href: '/coach/sala', icon: Dumbbell, label: 'Sesiones', exact: true },
            { href: '/coach/sala/videos', icon: Video, label: 'Vídeos' },
            EVALUATIONS_ITEM,
        ],
    },
    { title: 'Clientes', items: [MESSAGES_ITEM, MEMBERS_ITEM] },
]

// En el móvil caben cuatro accesos y «Más»: Evaluaciones va en «Más».
const salaPrimaryItems: NavItem[] = salaSections.flatMap(section => section.items).filter(item => item !== EVALUATIONS_ITEM)

const SALA_SETTINGS_HREF = '/coach/settings?tab=integraciones'

function isItemActive(item: NavItem, pathname: string | null) {
    return item.exact ? pathname === item.href : Boolean(pathname?.startsWith(item.href))
}

function rememberEnvironment(environment: Environment) {
    document.cookie = `${ENVIRONMENT_COOKIE}=${environment}; path=/; max-age=31536000; samesite=lax`
}

/** Online y Sala, a un toque. Solo sale en espacios que tienen las dos cosas. */
function EnvironmentSwitch({ value, onChange, tone }: { value: Environment; onChange: (environment: Environment) => void; tone: 'dark' | 'light' }) {
    return (
        <div
            role="group"
            aria-label="Entorno"
            className={cn('grid grid-cols-2 gap-1 rounded-full p-1', tone === 'dark' ? 'bg-white/[0.06] ring-1 ring-white/10' : 'bg-muted')}
        >
            {(['online', 'sala'] as const).map(option => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={cn(
                        'h-8 rounded-full text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2',
                        tone === 'dark'
                            ? (value === option ? 'bg-white text-[#0B0D12]' : 'text-white/55 hover:text-white focus-visible:ring-white/40')
                            : (value === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground focus-visible:ring-primary')
                    )}
                >
                    {option === 'online' ? 'Online' : 'Sala'}
                </button>
            ))}
        </div>
    )
}

export function CoachSidebar({ workspaces, environment: space }: {
    workspaces: Workspace[]
    environment: { environment: Environment; canSwitch: boolean }
}) {
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
    // En qué entorno se está sale de la pantalla; las compartidas mantienen el último.
    const [lastEnvironment, setLastEnvironment] = useState<Environment>(space.environment)
    const environment: Environment = !space.canSwitch ? space.environment : environmentForPath(pathname, lastEnvironment)
    useEffect(() => {
        if (environment === lastEnvironment) return
        setLastEnvironment(environment)
        rememberEnvironment(environment)
    }, [environment, lastEnvironment])

    function switchEnvironment(target: Environment) {
        if (target === environment) return
        rememberEnvironment(target)
        setLastEnvironment(target)
        router.push(ENVIRONMENT_HOME[target])
    }

    const inSala = environment === 'sala'

    // En Sala, al pulsar en la pantalla la barra se queda en iconos para dejar sitio a la cuadrícula.
    // Se abre pulsando la barra o su botón. En Online se queda como estaba.
    const [compact, setCompact] = useState(false)
    useEffect(() => {
        if (!inSala) {
            setCompact(false)
            return
        }
        const collapse = (event: PointerEvent) => {
            if (window.innerWidth < 1024) return
            const target = event.target as Element | null
            if (target?.closest('main')) setCompact(true)
        }
        document.addEventListener('pointerdown', collapse)
        return () => document.removeEventListener('pointerdown', collapse)
    }, [inSala])
    useEffect(() => {
        const root = document.documentElement
        if (compact) root.dataset.ntSidebar = 'compact'
        else delete root.dataset.ntSidebar
        return () => { delete root.dataset.ntSidebar }
    }, [compact])

    const settingsHref = inSala ? SALA_SETTINGS_HREF : '/coach/settings'
    const desktopSections = inSala ? salaSections : navSections
    const primaryItems = inSala ? salaPrimaryItems : mobilePrimaryItems
    const moreSections: Array<{ title: string; items: NavItem[] }> = inSala
        ? [
            { title: 'Sala', items: [EVALUATIONS_ITEM] },
            { title: 'Cuenta', items: [{ href: SALA_SETTINGS_HREF, icon: Settings2, label: 'Ajustes' }] },
        ]
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

    const isSecondaryRouteActive = moreSections.flatMap(section => section.items).some(item => pathname?.startsWith(item.href.split('?')[0]))
    const secondaryBadgeCount = moreSections.flatMap(section => section.items).reduce((total, item) => {
        return total + (item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0)
    }, 0)

    const countLabel = (count: number) => (count > 99 ? '99+' : String(count))

    return (
        <>
            {/* Barra lateral: tinta en los dos temas, como la web. `dark` hace que
                todo lo de dentro (campana, selector de espacio) use sus colores oscuros. */}
            <aside
                className={cn(
                    'dark fixed left-0 top-0 z-50 hidden h-full border-r border-white/[0.07] bg-[#0B0D12] text-white transition-[width] duration-200 lg:block',
                    compact ? 'w-[4.5rem]' : 'w-64'
                )}
                onClick={event => {
                    // Recogida, pulsar en un hueco de la barra la abre; los enlaces y botones van a lo suyo.
                    if (compact && !(event.target as Element).closest('a, button')) setCompact(false)
                }}
            >
                {compact ? (
                    <CompactSidebar
                        sections={desktopSections}
                        pathname={pathname}
                        badges={badges}
                        settingsHref={settingsHref}
                        settingsLabel={inSala ? 'Ajustes de sala' : 'Ajustes'}
                        loggingOut={loggingOut}
                        onLogout={handleLogout}
                        onExpand={() => setCompact(false)}
                    />
                ) : (
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
                        {inSala && (
                            <button
                                type="button"
                                onClick={() => setCompact(true)}
                                aria-label="Recoger la barra"
                                title="Recoger la barra"
                                className="-mr-2 shrink-0 rounded-lg p-1.5 text-white/45 hover:bg-white/[0.06] hover:text-white"
                            >
                                <PanelLeftClose className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {workspaces.length > 1 && (
                        <div className="px-3 pb-2">
                            <WorkspaceSwitcher workspaces={workspaces} />
                        </div>
                    )}

                    {space.canSwitch && (
                        <div className="px-3 pb-1 pt-1">
                            <EnvironmentSwitch value={environment} onChange={switchEnvironment} tone="dark" />
                        </div>
                    )}

                    <nav aria-label="Navegación del coach" className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
                        {desktopSections.map((section, idx) => (
                            <div key={section.title} className={cn(idx > 0 && 'mt-6')}>
                                <p className="nt-eyebrow mb-2 px-3 text-[10px] text-white/35">{section.title}</p>
                                <div className="space-y-0.5">
                                    {section.items.map((item) => {
                                        const isActive = isItemActive(item, pathname)
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
                            href={settingsHref}
                            prefetch={true}
                            aria-current={pathname?.startsWith('/coach/settings') ? 'page' : undefined}
                            className={cn(
                                'flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white',
                                pathname?.startsWith('/coach/settings') && 'bg-white text-[#0B0D12] hover:bg-white hover:text-[#0B0D12]'
                            )}
                        >
                            <Settings2 className="h-[18px] w-[18px]" />
                            {inSala ? 'Ajustes de sala' : 'Ajustes'}
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
                )}
            </aside>

            {/* Móvil: dock flotante de tinta con cuatro accesos y «Más», como el de la web. */}
            <nav
                aria-label="Navegación principal del coach"
                className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(var(--safe-area-bottom)+0.625rem)] pl-[calc(var(--safe-area-left)+0.75rem)] pr-[calc(var(--safe-area-right)+0.75rem)] lg:hidden"
            >
                <div className="dark mx-auto grid max-w-md grid-cols-5 gap-0.5 rounded-full bg-[#0B0D12]/[0.92] p-1.5 shadow-[0_20px_50px_-12px_rgba(11,13,18,0.65)] ring-1 ring-white/10 backdrop-blur-xl">
                    {primaryItems.map((item) => {
                        const isActive = isItemActive(item, pathname)
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
                                <p className="nt-eyebrow text-muted-foreground">{inSala ? 'Sala' : 'Portal del coach'}</p>
                                <SheetTitle className="nt-display text-[1.75rem]">Más opciones</SheetTitle>
                                {workspaces.length > 1 && <WorkspaceSwitcher workspaces={workspaces} />}
                                {space.canSwitch && (
                                    <div className="pt-2">
                                        <EnvironmentSwitch value={environment} onChange={switchEnvironment} tone="light" />
                                    </div>
                                )}
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
                                                const isActive = isItemActive({ ...item, href: item.href.split('?')[0] }, pathname)
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

/** La barra recogida: solo iconos, con el nombre al pasar por encima. */
function CompactSidebar({ sections, pathname, badges, settingsHref, settingsLabel, loggingOut, onLogout, onExpand }: {
    sections: Array<{ title: string; items: NavItem[] }>
    pathname: string | null
    badges: Record<string, number>
    settingsHref: string
    settingsLabel: string
    loggingOut: boolean
    onLogout: () => void
    onExpand: () => void
}) {
    const icon = 'flex h-10 w-10 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40'
    return (
        <div className="flex h-full flex-col items-center">
            <div className="flex flex-col items-center gap-2 pb-3 pt-5">
                <button type="button" onClick={onExpand} aria-label="Abrir la barra" title="Abrir la barra" className={icon}>
                    <PanelLeftOpen className="h-[18px] w-[18px]" />
                </button>
                <CoachNotificationsBell className="shrink-0 border-white/10 bg-white/[0.04] hover:bg-white/10" />
            </div>
            <nav aria-label="Navegación del coach" className="flex w-full flex-1 flex-col items-center overflow-y-auto pb-4 pt-2">
                {sections.map((section, idx) => (
                    <div key={section.title} className={cn('flex flex-col items-center gap-1', idx > 0 && 'mt-3 border-t border-white/[0.07] pt-3')}>
                        {section.items.map(item => {
                            const isActive = isItemActive(item, pathname)
                            const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    prefetch={true}
                                    title={item.label}
                                    aria-label={item.label}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={cn(icon, 'relative', isActive && 'bg-white hover:bg-white')}
                                >
                                    <item.icon className={cn('h-[18px] w-[18px]', isActive ? 'text-[#0058D8]' : 'text-white/55')} />
                                    {badgeCount > 0 && (
                                        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
                                    )}
                                </Link>
                            )
                        })}
                    </div>
                ))}
            </nav>
            <div className="flex w-full flex-col items-center gap-1 border-t border-white/[0.07] pb-4 pt-3">
                <Link
                    href={settingsHref}
                    prefetch={true}
                    title={settingsLabel}
                    aria-label={settingsLabel}
                    aria-current={pathname?.startsWith('/coach/settings') ? 'page' : undefined}
                    className={cn(icon, pathname?.startsWith('/coach/settings') && 'bg-white text-[#0B0D12] hover:bg-white')}
                >
                    <Settings2 className="h-[18px] w-[18px]" />
                </Link>
                <button
                    type="button"
                    onClick={onLogout}
                    disabled={loggingOut}
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                    className={cn(icon, 'text-white/45 hover:text-red-300 disabled:opacity-60')}
                >
                    <LogOut className="h-[18px] w-[18px]" />
                </button>
            </div>
        </div>
    )
}
