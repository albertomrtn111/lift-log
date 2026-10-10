'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from 'lucide-react'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { cn } from '@/lib/utils'

/** Avatar del atleta que abre el perfil. Vive dentro de AppTopActions. */
export function ProfileButton() {
    const pathname = usePathname()
    const { client } = useClientAppContext()
    const isActive = pathname?.startsWith('/profile')

    const initials = client?.profile?.full_name
        ? client.profile.full_name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part: string) => part[0])
            .join('')
            .toUpperCase()
        : null

    const avatarUrl = client?.profile?.avatar_url

    return (
        <Link
            href="/profile"
            aria-label="Perfil"
            aria-current={isActive ? 'page' : undefined}
            className={cn(
                'flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'ring-1 ring-border/70 hover:ring-primary/50'
            )}
        >
            {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : initials ? (
                <span className="flex h-full w-full items-center justify-center bg-primary/10 text-[11px] font-bold text-primary">
                    {initials}
                </span>
            ) : (
                <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                </span>
            )}
        </Link>
    )
}
