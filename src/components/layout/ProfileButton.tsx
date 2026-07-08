'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProfileButton() {
    const pathname = usePathname()
    const { client } = useClientAppContext()
    const isActive = pathname === '/profile'

    const initials = client?.profile?.full_name
        ? client.profile.full_name
            .split(' ')
            .slice(0, 2)
            .map((n: string) => n[0])
            .join('')
            .toUpperCase()
        : null

    const avatarUrl = client?.profile?.avatar_url

    return (
        <Link
            href="/profile"
            className={cn(
                'fixed top-[calc(var(--safe-area-top,0px)+18px)] right-4 z-50',
                'flex items-center justify-center w-9 h-9 rounded-full',
                'bg-background shadow-sm ring-2 transition-all',
                isActive
                    ? 'ring-primary shadow-md shadow-primary/20'
                    : 'ring-border hover:ring-primary/50'
            )}
            aria-label="Perfil"
        >
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={initials ?? 'Perfil'}
                    className="w-full h-full rounded-full object-cover"
                />
            ) : initials ? (
                <span
                    className={cn(
                        'w-full h-full rounded-full flex items-center justify-center text-xs font-bold',
                        isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                    )}
                >
                    {initials}
                </span>
            ) : (
                <span
                    className={cn(
                        'w-full h-full rounded-full flex items-center justify-center',
                        isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                    )}
                >
                    <User className="h-4 w-4" />
                </span>
            )}
        </Link>
    )
}
