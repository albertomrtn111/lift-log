'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Cómo empezar el primer plan desde "Primeros pasos" (?start=…) */
export type PlanStartIntent = 'template' | 'ai' | 'csv'

/**
 * Si la URL pide empezar el plan de una forma concreta, ejecuta `onStart`
 * una vez y quita el parámetro para que no se repita al recargar.
 */
export function usePlanStartIntent(intent: PlanStartIntent, onStart: () => void) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const onStartRef = useRef(onStart)
    onStartRef.current = onStart
    const requested = searchParams.get('start') === intent

    useEffect(() => {
        if (!requested) return
        onStartRef.current()
        const params = new URLSearchParams(searchParams.toString())
        params.delete('start')
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [requested, searchParams, router, pathname])
}
