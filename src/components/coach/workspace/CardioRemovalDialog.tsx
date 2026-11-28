'use client'

// Eliminar una sesión de cardio sin perder lo que registró el atleta (NXT-149):
// aviso con los datos de la sesión y, si ya está hecha, papelera con «Deshacer».

import { useEffect, useState } from 'react'
import { toast as sonnerToast } from 'sonner'
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
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cardioRemovalCopy } from '@/lib/safe-delete'
import { deleteCardioSession, getCardioRemovalInfo, restoreCardioSession } from '@/app/(coach)/coach/workspace/planning-actions'

type RemovalCopy = ReturnType<typeof cardioRemovalCopy>

export function CardioRemovalDialog({
    sessionId,
    onClose,
    onChanged,
}: {
    sessionId: string | null
    onClose: () => void
    /** Tras borrar o deshacer: volver a cargar el calendario. */
    onChanged: () => void
}) {
    const { toast } = useToast()
    const [copy, setCopy] = useState<RemovalCopy | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setCopy(null)
        setLoadError(null)
        if (!sessionId) return
        let cancelled = false
        getCardioRemovalInfo(sessionId)
            .then(result => {
                if (cancelled) return
                if (result.success) setCopy(cardioRemovalCopy(result.session))
                else setLoadError(result.error)
            })
            .catch(() => !cancelled && setLoadError('No se ha podido comprobar la sesión. No se ha borrado nada.'))
        return () => { cancelled = true }
    }, [sessionId])

    const undo = async (trashId: string) => {
        const result = await restoreCardioSession(trashId)
        if (result.success) {
            sonnerToast.success('Sesión recuperada', { description: 'Vuelve a estar en el calendario con lo que registró el atleta.' })
            onChanged()
        } else {
            toast({ title: 'No se ha podido recuperar', description: result.error, variant: 'destructive' })
        }
    }

    const confirm = async () => {
        if (!sessionId) return
        setBusy(true)
        try {
            const result = await deleteCardioSession(sessionId)
            if (!result.success) {
                toast({ title: 'No se ha podido eliminar', description: result.error, variant: 'destructive' })
                return
            }
            onClose()
            onChanged()
            if (result.mode === 'trash') {
                const trashId = result.trashId
                sonnerToast.success('Sesión eliminada', {
                    description: 'Se ha guardado una copia con lo que registró el atleta.',
                    duration: 10000,
                    action: { label: 'Deshacer', onClick: () => { void undo(trashId) } },
                })
            } else {
                sonnerToast.success('Sesión eliminada')
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <AlertDialog open={!!sessionId} onOpenChange={(open) => !open && !busy && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{copy?.title ?? '¿Eliminar esta sesión?'}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {loadError ?? copy?.description ?? 'Comprobando la sesión…'}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(event) => { event.preventDefault(); void confirm() }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={busy || !copy}
                    >
                        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando…</> : (copy?.confirm ?? 'Eliminar')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
