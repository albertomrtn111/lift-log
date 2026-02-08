'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Users,
    Calendar,
    UserCog,
    ChevronLeft,
    ChevronRight,
    Dumbbell,
    User,
    LogOut
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ModeSwitch } from '@/components/layout/ModeSwitch'
import { createClient } from '@/lib/supabase/client'
import { useCoachContext } from '@/contexts/CoachContext'

interface NavItem {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
}

const navItems: NavItem[] = [
    { href: '/coach/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/coach/members', icon: Users, label: 'Miembros' },
    { href: '/coach/calendar', icon: Calendar, label: 'Calendario' },
    { href: '/coach/clients', icon: UserCog, label: 'Workspace' },
    { href: '/coach/profile', icon: User, label: 'Perfil' },
]

export function CoachSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [collapsed, setCollapsed] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

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
                    'fixed left-0 top-0 z-50 h-full bg-card border-r border-border transition-all duration-300',
                    collapsed ? 'w-16' : 'w-64',
                    'hidden lg:block'
                )}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className={cn(
                        'flex items-center gap-3 p-4 border-b border-border',
                        collapsed && 'justify-center'
                    )}>
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Dumbbell className="h-5 w-5 text-primary" />
                        </div>
                        {!collapsed && (
                            <div>
                                <h1 className="font-bold text-lg">LiftLog</h1>
                                <p className="text-xs text-muted-foreground">Coach Portal</p>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-3 space-y-1">
                        {navItems.map((item) => {
                            const isActive = pathname?.startsWith(item.href)

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    prefetch={true}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                                        'hover:bg-muted/50',
                                        isActive && 'bg-primary/10 text-primary font-medium',
                                        collapsed && 'justify-center px-2'
                                    )}
                                    title={collapsed ? item.label : undefined}
                                >
                                    <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                                    {!collapsed && <span>{item.label}</span>}
                                </Link>
                            )
                        })}
                    </nav>

                    {/* Mode Switch (only if user has both roles) */}
                    {userRole === 'both' && (
                        <div className="p-3 border-t border-border">
                            {collapsed ? (
                                <ModeSwitch role={userRole} currentMode="coach" variant="compact" />
                            ) : (
                                <ModeSwitch role={userRole} currentMode="coach" variant="toggle" />
                            )}
                        </div>
                    )}

                    {/* Collapse button */}
                    <div className="p-3 border-t border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn('w-full', collapsed && 'px-2')}
                            onClick={() => setCollapsed(!collapsed)}
                        >
                            {collapsed ? (
                                <ChevronRight className="h-4 w-4" />
                            ) : (
                                <>
                                    <ChevronLeft className="h-4 w-4 mr-2" />
                                    Colapsar
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Logout */}
                    <div className="p-3 border-t border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn('w-full text-destructive hover:text-destructive', collapsed && 'px-2')}
                            onClick={handleLogout}
                            disabled={loggingOut}
                        >
                            <LogOut className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                            {!collapsed && (loggingOut ? 'Saliendo...' : 'Cerrar sesión')}
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Mobile bottom nav */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card">
                <div className="flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
                    {navItems.map((item) => {
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
