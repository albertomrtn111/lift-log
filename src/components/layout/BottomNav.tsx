'use client'

import { ClipboardList, Utensils, CalendarDays, BarChart3, Timer, User, Dumbbell, TrendingUp, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useClientUnreadMessages } from '@/hooks/useClientUnreadMessages'

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const navItems: NavItem[] = [
  { href: '/routine', icon: Dumbbell, label: 'Fuerza' }, // Was ClipboardList, 'Rutina'. Changed icon to Dumbbell for Strength.
  { href: '/diet', icon: Utensils, label: 'Dieta' },
  { href: '/planning', icon: CalendarDays, label: 'Plan' }, // New Planning tab
  { href: '/progress', icon: TrendingUp, label: 'Progreso' }, // Changed icon to TrendingUp? Original was CalendarDays. Let's check imports.
  { href: '/summary', icon: BarChart3, label: 'Resumen' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/profile', icon: User, label: 'Perfil' },
]

const DEBUG_NAV = true // Set to false to silence logs

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const isDev = process.env.NODE_ENV === 'development' && DEBUG_NAV
  const unreadCount = useClientUnreadMessages()

  // Log route changes in DEV
  useEffect(() => {
    if (isDev) {
      console.log('[BottomNav] Pathname changed to:', pathname)
    }
  }, [pathname, isDev])

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isDev) {
      console.log('[BottomNav] Clicked:', href, '| Current:', pathname)
    }

    // Avoid redundant navigation
    if (pathname === href) {
      if (isDev) console.log('[BottomNav] Redundant navigation prevented')
      e.preventDefault()
      return
    }

    // Defensive navigation: stop Link default behavior and handle via router
    e.preventDefault()

    if (isDev) console.log('[BottomNav] Executing router.push:', href)
    router.push(href)
    if (isDev) console.log('[BottomNav] router.push called')
  }

  return (
    <nav
      className="app-mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card glass"
    >
      <div className="flex items-center justify-around px-1 py-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/routine' && pathname?.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={(e) => handleNavClick(e, item.href)}
              className={cn(
                'nav-item flex-1 max-w-[80px]',
                isActive && 'nav-item-active'
              )}
            >
              <div className="relative">
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                {item.href === '/chat' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none pointer-events-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
