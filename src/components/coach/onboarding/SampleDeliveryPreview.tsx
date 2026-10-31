'use client'

import Link from 'next/link'
import { ArrowRight, Bell, ShieldCheck } from 'lucide-react'
import { LogoAppIcon } from '@/components/brand/LogoMark'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

/** Mismo título que el aviso real de feedback (lib/notifications/client.ts) */
const PUSH_TITLE = 'Tu entrenador ha revisado tu revisión'

function truncate(text: string, max = 100) {
    return text.length > max ? `${text.substring(0, max - 3)}...` : text
}

/**
 * Tras aprobar la revisión de Lucía: enseña lo que habría recibido un atleta
 * real (aviso en el móvil y mensaje en el chat). No se ha enviado nada.
 */
export function SampleDeliveryPreview({ open, onOpenChange, feedback }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    feedback: string | null
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto sm:w-full">
                <DialogHeader>
                    <DialogTitle>Esto es lo que recibe tu atleta</DialogTitle>
                    <DialogDescription>
                        {feedback
                            ? 'Un aviso en el móvil y tu mensaje en su chat, como bloque de revisión.'
                            : 'Su revisión queda cerrada. Si escribes un feedback, le llega un aviso y el mensaje en su chat.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Móvil */}
                <div className="mx-auto w-full max-w-[300px] rounded-[2.25rem] border-[6px] border-foreground/85 bg-gradient-to-b from-sky-950 via-slate-900 to-slate-950 p-3 shadow-xl">
                    <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-white/25" aria-hidden />
                    <p className="text-center text-3xl font-light tabular-nums text-white">9:41</p>

                    {feedback && (
                        <div className="mt-4 rounded-2xl bg-white/90 p-3 text-slate-900 shadow-lg backdrop-blur" role="img" aria-label={`Aviso: ${PUSH_TITLE}`}>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <LogoAppIcon className="h-4 w-4" />
                                <span className="font-semibold uppercase tracking-wide">NexTrain</span>
                                <span className="ml-auto">ahora</span>
                            </div>
                            <p className="mt-1 text-[13px] font-semibold leading-snug">{PUSH_TITLE}</p>
                            <p className="mt-0.5 text-[13px] leading-snug text-slate-700">{truncate(feedback)}</p>
                        </div>
                    )}

                    <div className="mt-4 rounded-2xl bg-background p-3 text-foreground">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chat</p>
                        {feedback ? (
                            <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                                    <Bell className="h-3 w-3" />
                                    Revisión de la semana
                                </p>
                                <p className="whitespace-pre-line text-[13px] leading-relaxed">{feedback}</p>
                            </div>
                        ) : (
                            <p className="text-[13px] text-muted-foreground">Revisión cerrada sin mensaje.</p>
                        )}
                    </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <p>Lucía es tu atleta de ejemplo: no se ha enviado nada a nadie.</p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Seguir explorando
                    </Button>
                    <Button asChild>
                        <Link href="/coach/dashboard">
                            Volver a Primeros pasos
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
