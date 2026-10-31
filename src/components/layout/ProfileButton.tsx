'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from 'lucide-react'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { cn } from '@/lib/utils'

/** Avatar del atleta en un botón circular que abre el perfil. Vive dentro de AppTopActions. */
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
            className={cn('client-glass client-header-button', isActive && 'ring-2 ring-primary')}
        >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : initials ? (
                    <span className="flex h-full w-full items-center justify-center bg-primary/15 text-xs font-bold tracking-tight text-primary">
                        {initials}
                    </span>
                ) : (
                    <User className="h-5 w-5" strokeWidth={1.9} />
                )}
            </span>
        </Link>
    )
}
