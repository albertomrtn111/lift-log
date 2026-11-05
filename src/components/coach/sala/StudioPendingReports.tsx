'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { StudioPendingReport } from '@/data/studio'
import { dismissReportNoticeAction } from '@/lib/studio/report-actions'

/** Informes por enviar tras la sesión. Se van al enviar o al descartarlos. */
export function StudioPendingReports({ reports }: { reports: StudioPendingReport[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    if (reports.length === 0) return null

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
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={isPending}
                            aria-label={`Descartar el informe de ${report.name}`}
                            onClick={() => startTransition(async () => {
                                const result = await dismissReportNoticeAction(report.sessionId, report.clientId)
                                if (!result.success) return void toast.error(result.error)
                                router.refresh()
                            })}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </li>
                ))}
            </ul>
        </Card>
    )
}
