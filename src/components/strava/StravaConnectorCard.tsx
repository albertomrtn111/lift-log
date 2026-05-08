'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, Loader2, RefreshCw, Unplug, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface StravaStatus {
    provider: 'strava'
    status: 'connected' | 'disconnected' | 'error' | 'revoked'
    connectedAt: string | null
    lastSyncAt: string | null
    errorMessage: string | null
    scope: string | null
}

function formatDateTime(value: string | null) {
    if (!value) return 'Sin datos'
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
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
            return {
                label: 'No conectado',
                badgeClass: 'border-muted-foreground/20 bg-muted text-muted-foreground',
                icon: Activity,
            }
        }
        if (status.status === 'connected') {
            return {
                label: 'Conectado',
                badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                icon: CheckCircle2,
            }
        }
        return {
            label: status.status === 'revoked' ? 'Reconectar' : 'Error',
            badgeClass: 'border-destructive/20 bg-destructive/10 text-destructive',
            icon: AlertCircle,
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

    const MetaIcon = meta.icon
    const isConnected = status?.status === 'connected'
    const needsReconnect = status?.status === 'error' || status?.status === 'revoked'

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                        <Zap className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">Conector de actividad</h3>
                            <Badge variant="outline" className={meta.badgeClass}>
                                <MetaIcon className="mr-1 h-3 w-3" />
                                {loading ? 'Cargando' : meta.label}
                            </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {isConnected
                                ? 'Tus actividades pueden importarse automáticamente.'
                                : 'Conecta tu app de actividad para importar automáticamente tus entrenamientos.'}
                        </p>
                    </div>
                </div>
                {loading && <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {isConnected && (
                <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Conectado</span>
                        <span className="text-right font-medium">{formatDateTime(status.connectedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Última sync</span>
                        <span className="text-right font-medium">{formatDateTime(status.lastSyncAt)}</span>
                    </div>
                </div>
            )}

            {status?.errorMessage && status.status !== 'connected' && (
                <p className="mt-3 text-sm text-destructive">{status.errorMessage}</p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {!isConnected ? (
                    <Button asChild className="w-full gap-2">
                        <a href="/api/strava/connect">
                            <Zap className="h-4 w-4" />
                            {needsReconnect ? 'Reconectar' : 'Conectar'}
                        </a>
                    </Button>
                ) : (
                    <>
                        <Button onClick={syncNow} disabled={syncing} className="w-full gap-2">
                            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Sincronizar ahora
                        </Button>
                        <Button
                            variant="outline"
                            onClick={disconnect}
                            disabled={disconnecting}
                            className="w-full gap-2"
                        >
                            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                            Desconectar
                        </Button>
                    </>
                )}
            </div>
        </Card>
    )
}
