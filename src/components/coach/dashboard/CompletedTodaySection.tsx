'use client'

import { useState } from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import type { CompletedReview } from '@/data/dashboard'
import Link from 'next/link'

interface CompletedTodaySectionProps {
    reviews: CompletedReview[]
}

export function CompletedTodaySection({ reviews }: CompletedTodaySectionProps) {
    const [open, setOpen] = useState(false)

    if (reviews.length === 0) return null

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-2 px-4 py-3 bg-green-500/5 border border-green-500/20 rounded-lg hover:bg-green-500/10 transition-colors cursor-pointer">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        ✓ {reviews.length} review{reviews.length !== 1 ? 's' : ''} completada{reviews.length !== 1 ? 's' : ''} hoy
                    </span>
                    {open
                        ? <ChevronDown className="h-4 w-4 text-green-600 ml-auto" />
                        : <ChevronRight className="h-4 w-4 text-green-600 ml-auto" />
                    }
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 border border-green-500/10 rounded-lg divide-y divide-green-500/10">
                    {reviews.map(r => (
                        <Link
                            key={r.review_id}
                            href={`/coach/clients?client=${r.client_id}`}
                            className="flex items-center gap-3 py-2.5 px-4 hover:bg-green-500/5 transition-colors no-underline text-foreground"
                        >
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            <span className="text-sm">{r.client_name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(r.approved_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </Link>
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
