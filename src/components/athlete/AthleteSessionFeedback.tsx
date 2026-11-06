'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { saveAthleteFeedbackAction } from '@/lib/athlete/feedback-actions'
import { cn } from '@/lib/utils'

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Lo único que el atleta escribe sobre una sesión de sala. */
export function AthleteSessionFeedback({ sessionId, feedback }: {
    sessionId: string
    feedback: { rpe: number | null; comment: string | null } | null
}) {
    const [rpe, setRpe] = useState<number | null>(feedback?.rpe ?? null)
    const [comment, setComment] = useState(feedback?.comment ?? '')
    const [isPending, startTransition] = useTransition()

    function save() {
        startTransition(async () => {
            const result = await saveAthleteFeedbackAction(sessionId, rpe, comment)
            if (result.success) toast.success('Guardado. Tu profesional lo verá.')
            else toast.error(result.error)
        })
    }

    return (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4" aria-labelledby="sesion-sensaciones">
            <div>
                <h2 id="sesion-sensaciones" className="text-[15px] font-semibold tracking-tight">¿Cómo te ha ido?</h2>
                <p className="text-[13px] text-muted-foreground">Del 1 al 10, ¿cuánto te ha costado?</p>
            </div>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Esfuerzo de la sesión">
                {RPE_VALUES.map(value => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={rpe === value}
                        onClick={() => setRpe(rpe === value ? null : value)}
                        className={cn(
                            'h-11 rounded-xl border text-[15px] font-semibold',
                            rpe === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 text-muted-foreground'
                        )}
                    >
                        {value}
                    </button>
                ))}
            </div>
            <Textarea
                value={comment}
                rows={2}
                maxLength={1000}
                aria-label="Comentario"
                placeholder="Algo que quieras contar (opcional)"
                onChange={event => setComment(event.target.value)}
            />
            <Button type="button" className="w-full" disabled={isPending} onClick={save}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
            </Button>
        </section>
    )
}
