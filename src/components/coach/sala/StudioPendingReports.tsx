'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { StudioPendingReport } from '@/data/studio'
import { dismissReportNoticeAction, sendPendingReportAction, snoozeReportAction } from '@/lib/studio/report-actions'

/** Informes por enviar tras la sesión. Se van al enviar o al descartarlos. */
export function StudioPendingReports({ reports }: { reports: StudioPendingReport[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    if (reports.length === 0) return null

    function run(action: () => Promise<{ success: boolean; error?: string }>) {
        startTransition(async () => {
            const result = await action()
            if (!result.success) return void toast.error(result.error)
            router.refresh()
        })
    }

    async function send(report: StudioPendingReport) {
        const result = await sendPendingReportAction(report.sessionId, report.clientId)
        if (result.success) {
            if (result.data.url) window.open(result.data.url, '_blank', 'noopener')
            else toast.success('Enviado')
        }
        return result
    }

    return (
        <Card className="space-y-1 p-3">
            <h2 className="text-sm font-semibold">Informes por enviar</h2>
            <ul>
                {reports.map(report => (
                    <li key={`${report.sessionId}-${report.clientId}`} className="flex items-center justify-between gap-2 text-sm">
                        <Link
                            href={`/coach/sala?${report.groupId ? `grupo=${report.groupId}` : `cliente=${report.clientId}`}`}
                            className="min-w-0 truncate py-1 text-primary hover:underline"
                        >
                            {report.name}
                        </Link>
                        <span className="flex shrink-0 items-center">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-primary"
                                disabled={isPending}
                                aria-label={`Enviar el informe de ${report.name}`}
                                onClick={() => run(() => send(report))}
                            >
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                disabled={isPending}
                                aria-label={`Posponer una hora el informe de ${report.name}`}
                                onClick={() => run(() => snoozeReportAction(report.sessionId, report.clientId, 1))}
                            >
                                <Clock className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                disabled={isPending}
                                aria-label={`Descartar el informe de ${report.name}`}
                                onClick={() => run(() => dismissReportNoticeAction(report.sessionId, report.clientId))}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </span>
                    </li>
                ))}
            </ul>
        </Card>
    )
}
