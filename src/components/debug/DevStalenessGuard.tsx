'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Guardian anti-staleness para desarrollo.
 * Detecta errores de carga de chunks/módulos (comunes con Next.js HMR)
 * y ofrece una opción rápida de recarga forzada.
 */
export function DevStalenessGuard() {
    const [lastError, setLastError] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        // Solo actuar en desarrollo
        if (process.env.NODE_ENV !== 'development') return

        const handleError = (event: ErrorEvent) => {
            const message = event.message || ''

            // Patrones comunes de errores de chunks/hmr
            const isStalenessError =
                message.includes('Cannot find module') ||
                message.includes('chunk load error') ||
                message.includes('Loading chunk') ||
                message.includes('script error')

            if (isStalenessError) {
                setLastError(message)
                setIsVisible(true)
            }
        }

        const handleRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason?.message || ''
            if (reason.includes('Loading chunk') || reason.includes('chunk load error')) {
                setLastError(reason)
                setIsVisible(true)
            }
        }

        window.addEventListener('error', handleError)
        window.addEventListener('unhandledrejection', handleRejection)

        return () => {
            window.removeEventListener('error', handleError)
            window.removeEventListener('unhandledrejection', handleRejection)
        }
    }, [])

    if (!isVisible) return null

    return (
        <div className="fixed bottom-24 left-4 right-4 z-[100] animate-in fade-in slide-in-from-bottom-4">
            <Alert variant="destructive" className="bg-destructive/95 backdrop-blur shadow-2xl border-2">
                <AlertTriangle className="h-4 w-4" />
                <div className="flex-1">
                    <AlertTitle className="flex items-center justify-between">
                        <span>Runtime / Chunk Stale</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 -mr-2 -mt-1 hover:bg-white/20"
                            onClick={() => setIsVisible(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </AlertTitle>
                    <AlertDescription className="mt-2 space-y-3">
                        <p className="text-sm font-mono bg-black/20 p-2 rounded overflow-x-auto">
                            {lastError || 'Se detectó un error de carga de módulos.'}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="w-full font-bold"
                                onClick={() => window.location.reload()}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Hard Reload
                            </Button>
                        </div>
                    </AlertDescription>
                </div>
            </Alert>
        </div>
    )
}
