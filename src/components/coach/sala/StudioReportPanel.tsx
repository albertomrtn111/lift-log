'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { ExternalLink, Link2, Loader2, Mail, MessageCircle, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import type { StudioGridData, StudioSession } from '@/data/studio'
import { formatShortDate } from '@/lib/studio/grid-rules'
import {
    emailReportAction,
    getReportPanelAction,
    revokeReportAction,
    saveReportAction,
    setReportConsentAction,
    whatsappReportAction,
    type ReportPanelData,
} from '@/lib/studio/report-actions'

const CHANNELS: Record<string, string> = { whatsapp: 'WhatsApp', email: 'email', link: 'enlace', download: 'descarga' }

/** Crear y enviar el informe de una sesión. En un grupo, cada persona que vino tiene el suyo. */
export function StudioReportPanel({ data, session, onClose }: {
    data: StudioGridData
    session: StudioSession
    onClose: () => void
}) {
    const [rows, setRows] = useState<ReportPanelData[] | null>(null)
    const [isPending, startTransition] = useTransition()

    const clientIds = useMemo(() => (data.group
        ? data.attendance.filter(entry => entry.session_id === session.id && entry.status === 'attended').map(entry => entry.client_id)
        : [data.client.id]), [data.group, data.attendance, data.client.id, session.id])

    const load = useCallback(async () => {
        const result = await getReportPanelAction(session.id, clientIds)
        if (result.success) setRows(result.data)
        else toast.error(result.error)
    }, [session.id, clientIds])

    useEffect(() => { void load() }, [load])

    function run(action: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
        startTransition(async () => {
            const result = await action()
            if (!result.success) return void toast.error(result.error)
            after?.()
            await load()
        })
    }

    function link(code: string) {
        return `${window.location.origin}/informe/${code}`
    }

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">Informe · {formatShortDate(session.session_date)}</SheetTitle>
                    <SheetDescription>Se abre en el móvil, sin cuenta ni aplicación.</SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {!rows && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />}
                    {rows?.length === 0 && <p className="text-sm text-muted-foreground">Pasa lista primero: el informe es de quien vino.</p>}
                    {rows?.map(row => {
                        const report = row.report && !row.report.revoked_at ? row.report : null
                        return (
                            <div key={row.clientId} className="space-y-3 rounded-md border p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate font-medium">{row.name}</span>
                                    {report && <span className="shrink-0 text-xs text-muted-foreground">Abierto {row.views} {row.views === 1 ? 'vez' : 'veces'}</span>}
                                </div>

                                <label className="flex items-center justify-between gap-2 text-sm">
                                    Ha dado su consentimiento
                                    <Switch
                                        checked={row.consent}
                                        disabled={isPending}
                                        onCheckedChange={consent => run(() => setReportConsentAction(row.clientId, consent))}
                                    />
                                </label>
                                {!row.consent && <p className="text-xs text-muted-foreground">Sin consentimiento no se envía el informe.</p>}

                                <Button
                                    type="button"
                                    variant={report ? 'outline' : 'default'}
                                    className="w-full"
                                    disabled={isPending}
                                    onClick={() => run(() => saveReportAction(session.id, row.clientId))}
                                >
                                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : report && <RefreshCw className="mr-2 h-4 w-4" />}
                                    {report ? 'Actualizar con lo último' : row.report?.revoked_at ? 'Crear con enlace nuevo' : 'Crear informe'}
                                </Button>

                                {report && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={isPending || !row.consent || !row.phone}
                                                onClick={() => run(
                                                    async () => {
                                                        const result = await whatsappReportAction(report, { name: row.name, phone: row.phone })
                                                        if (result.success) window.open(result.data.url, '_blank', 'noopener')
                                                        return result
                                                    }
                                                )}
                                            >
                                                <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={isPending || !row.consent || !row.email}
                                                onClick={() => run(() => emailReportAction(report, { name: row.name, email: row.email }), () => toast.success('Enviado'))}
                                            >
                                                <Mail className="mr-2 h-4 w-4" /> Email
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    void navigator.clipboard.writeText(link(report.code))
                                                    toast.success('Enlace copiado')
                                                }}
                                            >
                                                <Link2 className="mr-2 h-4 w-4" /> Copiar enlace
                                            </Button>
                                            <Button type="button" variant="outline" asChild>
                                                <a href={link(report.code)} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Ver</a>
                                            </Button>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs text-muted-foreground">
                                                {row.lastDelivery
                                                    ? `Enviado por ${CHANNELS[row.lastDelivery.channel]} el ${new Date(row.lastDelivery.sent_at).toLocaleDateString('es-ES')}`
                                                    : 'Sin enviar'}
                                            </p>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={isPending}
                                                onClick={() => run(() => revokeReportAction(report.id), () => toast.success('Enlace revocado'))}
                                            >
                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Revocar
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>
            </SheetContent>
        </Sheet>
    )
}
