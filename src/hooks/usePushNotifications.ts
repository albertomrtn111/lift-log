'use client'

import { useState, useEffect, useCallback } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const buffer = new ArrayBuffer(rawData.length)
    const outputArray = new Uint8Array(buffer)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function usePushNotifications() {
    const [permissionState, setPermissionState] = useState<PushPermissionState>('default')
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [isServerSynced, setIsServerSynced] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [lastError, setLastError] = useState<string | null>(null)

    // Comprobar soporte y estado inicial
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            setPermissionState('unsupported')
            return
        }
        setPermissionState(Notification.permission as PushPermissionState)
    }, [])

    // Registrar service worker y comprobar/re-sincronizar suscripción existente
    useEffect(() => {
        if (permissionState === 'unsupported') return

        async function checkAndSyncSubscription() {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js')
                await navigator.serviceWorker.ready

                const existing = await reg.pushManager.getSubscription()
                if (!existing) {
                    setIsSubscribed(false)
                    setIsServerSynced(false)
                    return
                }

                setIsSubscribed(true)

                // Intentar re-sincronizar con el servidor siempre que carguemos
                // (el servidor hace upsert, así que es idempotente)
                try {
                    const subJson = existing.toJSON()
                    const response = await fetch('/api/push/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            endpoint: subJson.endpoint,
                            keys: subJson.keys,
                            userAgent: navigator.userAgent,
                        }),
                    })
                    if (response.ok) {
                        setIsServerSynced(true)
                    } else {
                        const errData = await response.json().catch(() => ({}))
                        console.error('[push] Re-sync falló:', response.status, errData)
                        setIsServerSynced(false)
                    }
                } catch (syncErr) {
                    console.error('[push] Error en re-sync:', syncErr)
                    setIsServerSynced(false)
                }
            } catch (err) {
                console.error('[push] Error checking subscription:', err)
            }
        }
        checkAndSyncSubscription()
    }, [permissionState])

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
        if (!VAPID_PUBLIC_KEY) {
            setPermissionState('unsupported')
            setLastError('Las notificaciones push no están configuradas en este entorno.')
            return false
        }

        setIsLoading(true)
        setLastError(null)
        try {
            // 1. Pedir permiso si no se ha dado
            const permission = await Notification.requestPermission()
            setPermissionState(permission as PushPermissionState)
            if (permission !== 'granted') {
                setIsLoading(false)
                return false
            }

            // 2. Registrar SW y crear suscripción push
            const reg = await navigator.serviceWorker.ready
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            })

            // 3. Enviar suscripción al servidor
            const subJson = subscription.toJSON()
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    userAgent: navigator.userAgent,
                }),
            })

            if (response.ok) {
                setIsSubscribed(true)
                setIsServerSynced(true)
                return true
            } else {
                const errorData = await response.json().catch(() => ({}))
                console.error('[push] ❌ Servidor rechazó la suscripción:', response.status, JSON.stringify(errorData))
                setLastError(`Error ${response.status}: ${errorData?.error || 'Servidor rechazó la suscripción'}`)
                // La suscripción existe en el browser pero no en el servidor
                setIsSubscribed(true)
                setIsServerSynced(false)
                return false
            }
        } catch (err: any) {
            console.error('[push] Error subscribing:', err)
            setLastError(err?.message || 'Error desconocido al suscribirse')
            return false
        } finally {
            setIsLoading(false)
        }
    }, [])

    const unsubscribe = useCallback(async (): Promise<boolean> => {
        setIsLoading(true)
        try {
            const reg = await navigator.serviceWorker.ready
            const subscription = await reg.pushManager.getSubscription()
            if (!subscription) {
                setIsSubscribed(false)
                return true
            }

            await fetch('/api/push/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint }),
            })

            await subscription.unsubscribe()
            setIsSubscribed(false)
            setIsServerSynced(false)
            return true
        } catch (err) {
            console.error('[push] Error unsubscribing:', err)
            return false
        } finally {
            setIsLoading(false)
        }
    }, [])

    return { permissionState, isSubscribed, isServerSynced, isLoading, subscribe, unsubscribe, lastError }
}
