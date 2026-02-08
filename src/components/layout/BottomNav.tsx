'use client'

import { ClipboardList, Utensils, CalendarDays, BarChart3, Timer, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const navItems: NavItem[] = [
  { href: '/routine', icon: ClipboardList, label: 'Rutina' },
  { href: '/diet', icon: Utensils, label: 'Dieta' },
  { href: '/running', icon: Timer, label: 'Running' },
  { href: '/progress', icon: CalendarDays, label: 'Progreso' },
  { href: '/summary', icon: BarChart3, label: 'Resumen' },
  { href: '/profile', icon: User, label: 'Perfil' },
]

const DEBUG_NAV = true // Set to false to silence logs

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const isDev = process.env.NODE_ENV === 'development' && DEBUG_NAV

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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card glass">
      <div className="flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
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
              <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
