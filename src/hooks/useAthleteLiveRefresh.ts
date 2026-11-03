'use client'

import { useEffect, useRef } from 'react'
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import {
    ATHLETE_DATA_CHANGED_EVENT,
    scopesOverlap,
    type AthleteDataScope,
} from '@/lib/athlete-data-events'

/**
 * Mantiene al día una pantalla del atleta que carga sus datos en el navegador.
 * Llama a `refresh`:
 * - al volver a la app, recuperar la red o recibir un push (useResyncOnReturn);
 * - cuando otra parte de la app avisa de que cambiaron los datos de `scopes`
 *   (notifyAthleteDataChanged), incluidos los avisos nuevos del coach que
 *   llegan por Realtime (useClientNotifications los reenvía).
 *
 * `refresh` debe recargar sin vaciar la pantalla: se llama en segundo plano.
 */
export function useAthleteLiveRefresh(
    refresh: () => void,
    scopes: readonly AthleteDataScope[],
    enabled = true,
) {
    const refreshRef = useRef(refresh)
    refreshRef.current = refresh
    const scopesKey = scopes.join(',')

    useResyncOnReturn(() => refreshRef.current(), enabled)

    useEffect(() => {
        if (!enabled) return
        const wanted = scopesKey.split(',') as AthleteDataScope[]
        const onChanged = (event: Event) => {
            const changed = (event as CustomEvent<{ scopes?: AthleteDataScope[] }>).detail?.scopes
            if (scopesOverlap(wanted, changed)) refreshRef.current()
        }
        window.addEventListener(ATHLETE_DATA_CHANGED_EVENT, onChanged)
        return () => window.removeEventListener(ATHLETE_DATA_CHANGED_EVENT, onChanged)
    }, [enabled, scopesKey])
}
