'use client'

import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Dumbbell,
  MessageCircle,
  Salad,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useClientUnreadMessages } from '@/hooks/useClientUnreadMessages'

interface NavItem {
  href: string
  icon: LucideIcon
  label: string
}

const navItems: NavItem[] = [
  { href: '/routine', icon: Dumbbell, label: 'Fuerza' },
  { href: '/diet', icon: Salad, label: 'Dieta' },
  { href: '/planning', icon: CalendarDays, label: 'Plan' },
  { href: '/summary', icon: ChartNoAxesColumnIncreasing, label: 'Progreso' },
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
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
    <nav aria-label="Navegación principal" className="client-glass client-tab-bar">
      {navItems.map((item) => {
        const isActive = pathname === item.href ||
          (item.href !== '/routine' && pathname?.startsWith(item.href))

        return (
          <Link
            key={item.href}
            href={item.href}
            // Prefetch de las 5 pestañas principales: la navegación entre
            // tabs pasa de "fetch completo al pulsar" a casi instantánea.
            prefetch={true}
            onClick={(e) => handleNavClick(e, item.href)}
            aria-current={isActive ? 'page' : undefined}
            className={cn('client-tab', isActive && 'client-tab-active')}
          >
            <span className="relative flex h-6 w-6 items-center justify-center">
              <item.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 1.9} />
              {item.href === '/chat' && unreadCount > 0 && (
                <span className="pointer-events-none absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-card">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
            <span className="max-w-full truncate text-[10.5px] font-semibold leading-none tracking-tight">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
