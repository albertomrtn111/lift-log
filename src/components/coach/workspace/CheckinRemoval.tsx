'use client'

// «Eliminar esta revisión» sin perder lo que mandó el atleta (NXT-149): aviso con lo
// que tiene, papelera con «Deshacer» y lista para recuperar.

import { useCallback, useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import { ChevronDown, ChevronUp, Loader2, Trash2, Undo2 } from 'lucide-react'
import { checkinRemovalCopy } from '@/lib/safe-delete'
import {
    deleteCheckinAction,
    getCheckinRemovalInfoAction,
    listDeletedCheckinsAction,
    restoreDeletedRecordAction,
} from './actions'

type RemovalCopy = ReturnType<typeof checkinRemovalCopy>

export function CheckinRemovalDialog({
    checkinId,
    coachId,
    onClose,
    onRemoved,
}: {
    checkinId: string | null
    coachId: string
    onClose: () => void
    /** Tras borrar o recuperar: refrescar la lista y la papelera. */
    onRemoved: () => void
}) {
    const { toast } = useToast()
    const [copy, setCopy] = useState<RemovalCopy | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setCopy(null)
        setLoadError(null)
        if (!checkinId) return
        let cancelled = false
        getCheckinRemovalInfoAction(checkinId, coachId)
            .then(result => {
                if (cancelled) return
                if (result.success) setCopy(checkinRemovalCopy(result.records))
                else setLoadError(result.error)
            })
            .catch(() => !cancelled && setLoadError('No se ha podido comprobar qué tiene la revisión. No se ha borrado nada.'))
        return () => { cancelled = true }
    }, [checkinId, coachId])

    const undo = async (trashId: string) => {
        const result = await restoreDeletedRecordAction(trashId, coachId)
        if (result.success) {
            toast({ title: 'Revisión recuperada' })
            onRemoved()
        } else {
            toast({ title: 'No se ha podido recuperar', description: result.error, variant: 'destructive' })
        }
    }

    const confirm = async () => {
        if (!checkinId) return
        setBusy(true)
        try {
            const result = await deleteCheckinAction(checkinId, coachId)
            if (!result.success) {
                toast({ title: 'No se ha podido eliminar', description: result.error, variant: 'destructive' })
                return
            }
            onClose()
            onRemoved()
            if (result.mode === 'trash') {
                const trashId = result.trashId
                toast({
                    title: 'Revisión eliminada',
                    description: 'Está en «Revisiones eliminadas» por si la necesitas.',
                    duration: 10000,
                    action: (
                        <ToastAction altText="Deshacer: recuperar la revisión" onClick={() => { void undo(trashId) }}>
                            Deshacer
                        </ToastAction>
                    ),
                })
            } else {
                toast({ title: 'Revisión eliminada' })
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <AlertDialog open={!!checkinId} onOpenChange={(open) => !open && !busy && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{copy?.title ?? '¿Eliminar esta revisión?'}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {loadError ?? copy?.description ?? 'Comprobando lo que tiene la revisión…'}
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

type DeletedItem = Awaited<ReturnType<typeof listDeletedCheckinsAction>>['items'][number]

function formatDay(value: string | null) {
    if (!value) return null
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Revisiones de este atleta en la papelera, con «Recuperar». No ocupa nada si no hay. */
export function DeletedCheckinsList({
    clientId,
    coachId,
    refreshKey,
    onRestored,
}: {
    clientId: string
    coachId: string
    /** Cambia tras borrar o recuperar para volver a leer la papelera. */
    refreshKey: number
    onRestored: () => void
}) {
    const { toast } = useToast()
    const [items, setItems] = useState<DeletedItem[]>([])
    const [open, setOpen] = useState(false)
    const [restoringId, setRestoringId] = useState<string | null>(null)

    const load = useCallback(async () => {
        const result = await listDeletedCheckinsAction(clientId, coachId)
        if (result.success) setItems(result.items)
    }, [clientId, coachId])

    useEffect(() => { void load() }, [load, refreshKey])

    if (items.length === 0) return null

    const restore = async (id: string) => {
        setRestoringId(id)
        try {
            const result = await restoreDeletedRecordAction(id, coachId)
            if (result.success) {
                toast({ title: 'Revisión recuperada', description: 'Vuelve a estar en la lista con sus respuestas y fotos.' })
                await load()
                onRestored()
            } else {
                toast({ title: 'No se ha podido recuperar', description: result.error, variant: 'destructive' })
            }
        } finally {
            setRestoringId(null)
        }
    }

    return (
        <div className="rounded-2xl border border-dashed border-border/70 p-3">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={open}
            >
                <Trash2 className="h-4 w-4" />
                <span className="flex-1">Revisiones eliminadas ({items.length})</span>
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {open && (
                <ul className="mt-2 divide-y divide-border/60">
                    {items.map(item => {
                        const when = formatDay(item.submittedAt) ?? formatDay(item.periodEnd)
                        return (
                            <li key={item.id} className="flex items-center gap-2 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{when ? `Revisión del ${when}` : 'Revisión sin enviar'}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {item.summary ? `${item.summary} · ` : ''}eliminada el {formatDay(item.deletedAt)}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 shrink-0 gap-1.5 rounded-full"
                                    disabled={restoringId === item.id}
                                    onClick={() => restore(item.id)}
                                >
                                    {restoringId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                                    Recuperar
                                </Button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
