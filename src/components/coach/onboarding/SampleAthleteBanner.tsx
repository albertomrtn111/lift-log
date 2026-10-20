'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { deleteSampleAthleteAction } from './actions'

export function SampleAthleteBanner({ coachId, clientId, clientName }: { coachId: string; clientId: string; clientName: string }) {
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { toast } = useToast()
    const firstName = clientName.split(/\s+/)[0] || 'la atleta de ejemplo'

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteSampleAthleteAction(coachId, clientId)
            if (!result.success) {
                toast({ title: 'No se pudo borrar', description: result.error, variant: 'destructive' })
                return
            }
            setConfirmOpen(false)
            toast({ title: `${firstName} se ha borrado`, description: 'Ya no aparecerá en tu panel.' })
            router.replace('/coach/clients')
            router.refresh()
        })
    }

    return (
        <>
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5 sm:flex-row sm:items-center sm:justify-between" role="note">
                <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        <FlaskConical className="h-4 w-4" />
                    </span>
                    <div className="text-sm">
                        <p className="font-semibold">Atleta de ejemplo. Nada se envía; bórrala cuando quieras.</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Prueba lo que quieras con {firstName}: no cuenta en tu facturación ni en tu límite de atletas.
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5 self-start sm:self-auto" onClick={() => setConfirmOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    Borrar a {firstName}
                </Button>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Borrar a {firstName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se borran {firstName} y todos sus datos de ejemplo, también lo que hayas creado para ella. No se puede deshacer ni volver a crear.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => { event.preventDefault(); handleDelete() }}
                            disabled={isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Borrar definitivamente
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
