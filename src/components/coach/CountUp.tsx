'use client'

import { useEffect, useRef } from 'react'

/**
 * Número que cuenta hasta su valor la primera vez que se ve en la sesión, como
 * en la web comercial. El HTML ya lleva el valor final: sin JavaScript, con
 * «reducir movimiento» o en visitas siguientes se ve directamente.
 */
export function CountUp({ value, id, className }: { value: number; id: string; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el || value <= 0) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const key = `nt-count:${id}`
        try {
            if (sessionStorage.getItem(key)) return
            sessionStorage.setItem(key, '1')
        } catch {
            return
        }

        const duration = 900
        const start = performance.now()
        let frame = 0
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - t, 4)
            el.textContent = Math.round(value * eased).toLocaleString('es-ES')
            if (t < 1) frame = requestAnimationFrame(tick)
        }
        el.textContent = '0'
        frame = requestAnimationFrame(tick)
        return () => {
            cancelAnimationFrame(frame)
            el.textContent = value.toLocaleString('es-ES')
        }
    }, [value, id])

    return (
        <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {value.toLocaleString('es-ES')}
        </span>
    )
}
