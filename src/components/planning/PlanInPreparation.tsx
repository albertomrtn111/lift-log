'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Check, MessageCircle, Scale } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { RegistrarSheet } from '@/components/progress/RegistrarSheet'

/** En lugar de un calendario vacío: el coach aún está preparando el primer plan */
export function PlanInPreparation({ coachName }: { coachName: string }) {
    const [registrarOpen, setRegistrarOpen] = useState(false)
    const [weightSaved, setWeightSaved] = useState(false)

    return (
        <div className="mx-auto max-w-lg px-4 pb-8 pt-6">
            <Card className="p-6 text-center">
                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <CalendarClock className="h-7 w-7" />
                </span>
                <h1 className="text-xl font-bold leading-tight">{coachName} está preparando tu plan</h1>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    Te avisaremos en cuanto lo publique.
                </p>
            </Card>

            <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mientras tanto</h2>
            <div className="space-y-2.5">
                <button
                    type="button"
                    onClick={() => setRegistrarOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:bg-muted/50"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                        {weightSaved ? <Check className="h-5 w-5" /> : <Scale className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0">
                        <span className="block font-semibold">{weightSaved ? 'Peso de hoy registrado' : 'Registra el peso de hoy'}</span>
                        <span className="block text-sm text-muted-foreground">Así {coachName} tendrá tu punto de partida.</span>
                    </span>
                </button>
                <Link
                    href="/chat"
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:bg-muted/50"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <MessageCircle className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                        <span className="block font-semibold">Escribe a {coachName}</span>
                        <span className="block text-sm text-muted-foreground">Cuéntale cualquier cosa que quieras que tenga en cuenta.</span>
                    </span>
                </Link>
            </div>

            <RegistrarSheet open={registrarOpen} onOpenChange={setRegistrarOpen} onSaved={() => setWeightSaved(true)} />
        </div>
    )
}
