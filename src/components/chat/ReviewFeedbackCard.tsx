'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ClipboardCheck, MessageSquareQuote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ReviewFeedbackCardProps {
    content: string
    createdAt: string
}

export function ReviewFeedbackCard({ content, createdAt }: ReviewFeedbackCardProps) {
    const reviewDate = format(new Date(createdAt), "d MMM yyyy", { locale: es })

    return (
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.10] via-background to-background px-4 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                    <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-700">
                        <ClipboardCheck className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">Revisión · {reviewDate}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Feedback de tu coach</p>
                    </div>
                </div>
                <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-700">
                    Revisión
                </Badge>
            </div>

            <div className="mt-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <MessageSquareQuote className="h-3.5 w-3.5" />
                    Comentario enviado desde la revisión
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{content}</p>
            </div>
        </div>
    )
}
