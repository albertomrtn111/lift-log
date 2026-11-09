'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import { AthleteAvatar } from '@/components/coach/AthleteAvatar'
import { cn } from '@/lib/utils'

export interface WallAthlete {
    id: string
    name: string
    initials: string
    avatarUrl: string | null
    /** Solo los que necesitan atención: se quedan encendidos */
    severity?: 'high' | 'medium'
    reason?: string
}

const RING = { high: '#F87171', medium: '#FBBF24' } as const
const PLAYED_KEY = 'nt-wall-played'
const MAX_TILES = 64

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Tamaño de cada atleta según cuántos haya: con pocos se ven grandes, con muchos caben todos.
function layout(count: number) {
    if (count <= 12) return { size: 'h-10 w-10 text-[13px] sm:h-12 sm:w-12 sm:text-[15px]', cols: 'grid-cols-6', ring: '-inset-[4px] sm:-inset-[5px]' }
    if (count <= 24) return { size: 'h-8 w-8 text-[11px] sm:h-11 sm:w-11 sm:text-[14px]', cols: 'grid-cols-8', ring: '-inset-[3px] sm:-inset-[4px]' }
    if (count <= 40) return { size: 'h-9 w-9 text-[12px]', cols: 'grid-cols-8', ring: '-inset-[4px]' }
    return { size: 'h-7 w-7 text-[10px]', cols: 'grid-cols-10 sm:grid-cols-12', ring: '-inset-[3px]' }
}

/**
 * El muro de la web comercial con los atletas de verdad: entran todos, se apagan
 * y se quedan encendidos los que hoy te necesitan. La animación sale una vez por
 * sesión; después el muro aparece ya colocado.
 */
export function AthleteWall({ athletes }: { athletes: WallAthlete[] }) {
    const [play, setPlay] = useState(true)
    const [pulse, setPulse] = useState(true)

    useIsoLayoutEffect(() => {
        let first = false
        try {
            first = !sessionStorage.getItem(PLAYED_KEY)
            if (first) sessionStorage.setItem(PLAYED_KEY, '1')
        } catch { /* sin almacenamiento: muro ya colocado */ }
        if (!first) {
            setPlay(false)
            setPulse(false)
            return
        }
        // Al acabar la entrada se quita la animación para que el ratón pueda encender a cualquiera.
        const timer = window.setTimeout(() => setPlay(false), 2300)
        return () => window.clearTimeout(timer)
    }, [])

    if (athletes.length === 0) return null

    const shown = athletes.slice(0, MAX_TILES)
    const hidden = athletes.length - shown.length
    const { size, cols, ring } = layout(shown.length)

    return (
        <div className={cn('w-full', play && 'nt-wall-play', pulse && 'nt-wall-pulse')}>
            <ul className={cn('grid justify-items-center gap-x-3 gap-y-5', cols)} aria-label="Tus atletas">
                {shown.map((athlete, index) => {
                    const lit = Boolean(athlete.severity)
                    // Entran desde el principio de la lista hacia el final, en cascada.
                    const delay = `${Math.min(index, 30) * 28}ms`
                    return (
                        <li key={athlete.id} className="relative">
                            <Link
                                href={`/coach/clients?client=${athlete.id}`}
                                aria-label={lit ? `${athlete.name}: ${athlete.reason}` : athlete.name}
                                className={cn(
                                    'group relative block rounded-full focus-visible:outline-none',
                                    lit ? 'nt-wall-lit z-10' : 'nt-wall-tile'
                                )}
                                style={{ animationDelay: lit ? `${delay}, 1200ms` : `${delay}, 1100ms` }}
                            >
                                {lit && (
                                    <span
                                        aria-hidden
                                        className={cn('nt-wall-ring absolute rounded-full border-2', ring)}
                                        style={{ color: RING[athlete.severity!], borderColor: RING[athlete.severity!] }}
                                    />
                                )}
                                <AthleteAvatar
                                    initials={athlete.initials}
                                    avatarUrl={athlete.avatarUrl}
                                    seed={athlete.name}
                                    className={cn(size, 'ring-1 ring-white/10')}
                                />
                                <span
                                    role="tooltip"
                                    className="pointer-events-none absolute left-1/2 top-full z-20 mt-2.5 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#1F2433] px-3 py-2 text-left opacity-0 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.9)] ring-1 ring-white/15 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
                                >
                                    <span className="block text-[13px] font-semibold text-white">{athlete.name}</span>
                                    {athlete.reason && <span className="mt-0.5 block text-[12px] text-white/60">{athlete.reason}</span>}
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
            {hidden > 0 && (
                <p className="nt-eyebrow mt-3 text-center text-white/40">y {hidden} atletas más</p>
            )}
        </div>
    )
}
