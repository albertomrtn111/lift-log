'use client'

import { useEffect, useRef } from 'react'

/** Margen para no repetir la recarga cuando llegan varios eventos seguidos */
const MIN_INTERVAL_MS = 2_000

/**
 * Llama a `resync` cuando la app vuelve a primer plano, recupera la red o
 * recibe una notificación push (public/sw.js avisa a las pestañas abiertas).
 *
 * Realtime no reenvía lo que pasó mientras el socket estaba caído (pestaña en
 * segundo plano, móvil bloqueado, portátil suspendido, wifi intermitente):
 * sin esto, lo nuevo no aparece hasta refrescar a mano.
 */
export function useResyncOnReturn(resync: () => void, enabled = true) {
    const resyncRef = useRef(resync)
    resyncRef.current = resync

    useEffect(() => {
        if (!enabled) return
        let last = 0

        const run = () => {
            if (document.visibilityState !== 'visible') return
            const now = Date.now()
            if (now - last < MIN_INTERVAL_MS) return
            last = now
            resyncRef.current()
        }
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) run()
        }
        const onWorkerMessage = (event: MessageEvent) => {
            if (event.data?.type === 'nextrain:push') run()
        }
        const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null

        document.addEventListener('visibilitychange', run)
        window.addEventListener('online', run)
        window.addEventListener('pageshow', onPageShow)
        worker?.addEventListener('message', onWorkerMessage)
        return () => {
            document.removeEventListener('visibilitychange', run)
            window.removeEventListener('online', run)
            window.removeEventListener('pageshow', onPageShow)
            worker?.removeEventListener('message', onWorkerMessage)
        }
    }, [enabled])
}
