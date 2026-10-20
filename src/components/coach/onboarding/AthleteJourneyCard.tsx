'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Loader2, Send, UserPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AthleteJourneyRow } from '@/lib/onboarding/athlete-journey-data'
import { resendInviteAction } from '@/components/coach/invite-actions'

export function AthleteJourneyCard({ coachId, rows }: { coachId: string; rows: AthleteJourneyRow[] }) {
    return (
        <Card className="overflow-hidden" aria-labelledby="atletas-en-camino-title">
            <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <h2 id="atletas-en-camino-title" className="font-semibold">Atletas en camino</h2>
                </div>
                <p className="hidden text-xs text-muted-foreground sm:block">Su alta, paso a paso</p>
            </div>
            <ul className="divide-y divide-border/60">
                {rows.map(row => <JourneyRow key={row.clientId} coachId={coachId} row={row} />)}
            </ul>
        </Card>
    )
}

function JourneyRow({ coachId, row }: { coachId: string; row: AthleteJourneyRow }) {
    const [isPending, startTransition] = useTransition()
    const [resentAt, setResentAt] = useState<string | null>(null)
    const { toast } = useToast()
    const invitedAt = resentAt ?? row.invitedAt

    const handleResend = () => {
        startTransition(async () => {
            const result = await resendInviteAction(row.clientId, coachId)
            if (result.success) {
                setResentAt(new Date().toISOString())
                toast({ title: 'Invitación reenviada', description: `Le hemos enviado un enlace nuevo a ${row.email}.` })
            } else {
                toast({ title: 'No se pudo reenviar', description: result.error, variant: 'destructive' })
            }
        })
    }

    return (
        <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <Link href={`/coach/clients?client=${row.clientId}`} className="font-medium hover:underline">{row.name}</Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.journey.done} de {row.journey.total} pasos
                    {invitedAt && ` · invitación ${formatDistanceToNow(new Date(invitedAt), { addSuffix: true, locale: es })}`}
                </p>
                <ol className="mt-2 flex flex-wrap gap-1.5" aria-label={`Pasos de ${row.name}`}>
                    {row.journey.steps.map(step => (
                        <li
                            key={step.id}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                step.done ? 'border-success/30 bg-success/10 text-success'
                                    : step.skipped ? 'border-border text-muted-foreground/70'
                                    : 'border-border text-muted-foreground',
                            )}
                        >
                            {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
                            {step.label}
                            <span className="sr-only">{step.done ? ' (hecho)' : step.skipped ? '' : ' (pendiente)'}</span>
                        </li>
                    ))}
                </ol>
            </div>
            {row.journey.canResend && (
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5 self-start sm:self-auto" onClick={handleResend} disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Reenviar invitación
                </Button>
            )}
        </li>
    )
}
