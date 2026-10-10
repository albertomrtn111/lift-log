'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ClipboardCheck } from 'lucide-react'

interface ReviewFeedbackCardProps {
    content: string
    createdAt: string
}

export function ReviewFeedbackCard({ content, createdAt }: ReviewFeedbackCardProps) {
    const reviewDate = format(new Date(createdAt), "d 'de' MMMM", { locale: es })
    const time = format(new Date(createdAt), 'HH:mm')

    return (
        <div className="overflow-hidden rounded-2xl border border-amber-500/25 bg-card text-left shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-amber-500/15 bg-amber-500/[0.08] px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <ClipboardCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        Feedback de revisión
                    </p>
                    <p className="text-sm font-semibold leading-tight text-foreground">Revisión del {reviewDate}</p>
                </div>
            </div>
            <p className="whitespace-pre-wrap px-3.5 py-3 text-sm leading-relaxed text-foreground">{content}</p>
            <p className="px-3.5 pb-2 text-right text-[10px] tabular-nums text-muted-foreground">{time}</p>
        </div>
    )
}
