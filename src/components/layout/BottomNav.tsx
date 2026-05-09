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
    <nav
      className="app-mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 shadow-[0_-16px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-around px-2 py-1.5">
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
                'client-bottom-nav-item flex-1 max-w-[80px]',
                isActive && 'client-bottom-nav-item-active'
              )}
            >
              <div className={cn('client-nav-icon-shell', isActive && 'client-nav-icon-shell-active')}>
                <item.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.45 : 2.1} />
                {item.href === '/chat' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none pointer-events-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
