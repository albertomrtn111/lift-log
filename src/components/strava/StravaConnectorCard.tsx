'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Loader2, RefreshCw, Route, Unplug, Watch } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface StravaStatus {
    provider: 'strava'
    status: 'connected' | 'disconnected' | 'error' | 'revoked'
    connectedAt: string | null
    lastSyncAt: string | null
    errorMessage: string | null
    scope: string | null
    hasRequiredPermissions: boolean
    requiresReauthorization: boolean
}

function formatDateTime(value: string | null) {
    if (!value) return 'Sin datos'
    return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

function formatDate(value: string | null) {
    if (!value) return 'Sin datos'
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

export function StravaConnectorCard() {
    const [status, setStatus] = useState<StravaStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [disconnecting, setDisconnecting] = useState(false)

    async function loadStatus() {
        setLoading(true)
        try {
            const res = await fetch('/api/strava/status', { cache: 'no-store' })
            if (!res.ok) throw new Error('status')
            setStatus(await res.json())
        } catch {
            setStatus({
                provider: 'strava',
                status: 'error',
                connectedAt: null,
                lastSyncAt: null,
                errorMessage: 'No se pudo cargar el estado',
                scope: null,
                hasRequiredPermissions: false,
                requiresReauthorization: false,
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadStatus()
    }, [])

    const meta = useMemo(() => {
        if (!status || status.status === 'disconnected') {
            return { label: 'Sin conectar', chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' }
        }
        if (status.status === 'connected' && !status.requiresReauthorization) {
            return { label: 'Conectado', chip: 'bg-success/10 text-success', dot: 'bg-success' }
        }
        return {
            label: status.status === 'revoked' || status.requiresReauthorization ? 'Reconectar' : 'Error',
            chip: 'bg-destructive/10 text-destructive',
            dot: 'bg-destructive',
        }
    }, [status])

    async function syncNow() {
        setSyncing(true)
        try {
            const res = await fetch('/api/strava/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ perPage: 20 }),
            })
            if (!res.ok) throw new Error('sync')
            const data = await res.json()
            toast.success(`${data.imported ?? 0} actividades revisadas`)
            window.dispatchEvent(new Event('strava:pending-updated'))
            await loadStatus()
        } catch {
            toast.error('No se pudo sincronizar el conector')
        } finally {
            setSyncing(false)
        }
    }

    async function disconnect() {
        setDisconnecting(true)
        try {
            const res = await fetch('/api/strava/disconnect', { method: 'POST' })
            if (!res.ok) throw new Error('disconnect')
            toast.success('Conector desconectado')
            await loadStatus()
        } catch {
            toast.error('No se pudo desconectar el conector')
        } finally {
            setDisconnecting(false)
        }
    }

    const isConnected = status?.status === 'connected'
    const needsReconnect = status?.status === 'error'
        || status?.status === 'revoked'
        || status?.requiresReauthorization

    return (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="flex items-center gap-3 p-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FC4C02] text-white shadow-sm">
                    <Route className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-tight">Strava</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {loading
                            ? 'Comprobando conexión…'
                            : isConnected && !needsReconnect
                                ? `Última sincronización: ${formatDateTime(status?.lastSyncAt ?? null)}`
                                : needsReconnect
                                    ? 'Vuelve a autorizar para seguir importando entrenos.'
                                    : 'Importa tus entrenamientos automáticamente.'}
                    </p>
                </div>
                {loading ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                    <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.chip)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                        {meta.label}
                    </span>
                )}
            </div>

            {status?.errorMessage && !isConnected && (
                <p className="mx-3.5 mb-3 rounded-xl bg-destructive/[0.06] px-3 py-2 text-xs text-destructive">{status.errorMessage}</p>
            )}

            <div className={cn('flex gap-2 px-3.5 pb-3.5', loading && !status && 'hidden')}>
                {!isConnected || needsReconnect ? (
                    <a
                        href="/api/strava/connect"
                        className="flex h-10 flex-1 items-center justify-center rounded-xl bg-[#FC4C02] text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                    >
                        {needsReconnect ? 'Reconectar Strava' : 'Conectar con Strava'}
                    </a>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={syncNow}
                            disabled={syncing}
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Sincronizar
                        </button>
                        <button
                            type="button"
                            onClick={disconnect}
                            disabled={disconnecting}
                            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                        >
                            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                            Desconectar
                        </button>
                    </>
                )}
            </div>

            {isConnected && status?.connectedAt && (
                <p className="-mt-1 px-3.5 pb-3 text-[11px] text-muted-foreground">Conectado desde el {formatDate(status.connectedAt)}</p>
            )}

            {/* Muchos atletas usan un reloj y no saben que llega vía Strava */}
            <details className="group border-t border-border/60">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <Watch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">¿Usas Garmin, Polar, Coros o Apple Watch?</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-1.5 px-3.5 pb-3.5 pl-10 text-xs leading-relaxed text-muted-foreground">
                    <p>
                        Enlaza tu reloj con Strava una sola vez y tus entrenos llegarán aquí solos,
                        con ritmo, distancia y pulsaciones.
                    </p>
                    <p>
                        <span className="font-medium text-foreground">Con Garmin:</span> abre Garmin Connect →
                        Más → Configuración → Apps y servicios conectados → Strava.
                    </p>
                    <a
                        href="https://www.strava.com/settings/apps"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                        Ver mis apps conectadas en Strava
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
            </details>
        </div>
    )
}
