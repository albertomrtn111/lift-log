'use client'

import { useState, useEffect, useCallback } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

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
    const [isLoading, setIsLoading] = useState(false)

    // Comprobar soporte y estado inicial
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setPermissionState('unsupported')
            return
        }
        setPermissionState(Notification.permission as PushPermissionState)
    }, [])

    // Registrar service worker y comprobar suscripción existente
    useEffect(() => {
        if (permissionState === 'unsupported') return

        async function checkSubscription() {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js')
                const existing = await reg.pushManager.getSubscription()
                setIsSubscribed(!!existing)
            } catch (err) {
                console.error('[push] Error checking subscription:', err)
            }
        }
        checkSubscription()
    }, [permissionState])

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false

        setIsLoading(true)
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
                return true
            }
            return false
        } catch (err) {
            console.error('[push] Error subscribing:', err)
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
            return true
        } catch (err) {
            console.error('[push] Error unsubscribing:', err)
            return false
        } finally {
            setIsLoading(false)
        }
    }, [])

    return { permissionState, isSubscribed, isLoading, subscribe, unsubscribe }
}
