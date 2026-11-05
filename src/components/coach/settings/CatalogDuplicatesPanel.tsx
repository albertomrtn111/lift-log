'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Card } from '@/components/ui/card'
import {
    dismissCatalogDuplicateAction,
    getCatalogDuplicatesAction,
    mergeCatalogExercisesAction,
    type DuplicateExercise,
    type DuplicatePair,
} from './catalog-duplicates-actions'

type PendingMerge = { source: DuplicateExercise; target: DuplicateExercise }

export function CatalogDuplicatesPanel() {
    const [pairs, setPairs] = useState<DuplicatePair[] | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [merge, setMerge] = useState<PendingMerge | null>(null)
    const [pending, startTransition] = useTransition()

    const load = useCallback(async () => {
        const result = await getCatalogDuplicatesAction()
        if (result.success) {
            setPairs(result.data ?? [])
            setLoadError(null)
        } else {
            setLoadError(result.error)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    function run(action: () => Promise<{ success: boolean; error?: string }>, done: string) {
        startTransition(async () => {
            const result = await action()
            if (result.success) {
                toast.success(done)
                await load()
            } else {
                toast.error(result.error ?? 'No se pudo guardar.')
            }
        })
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold">Posibles duplicados</h2>
                <p className="text-sm text-muted-foreground">
                    Ejercicios creados a pesar de parecerse a otro del catálogo común.
                </p>
            </div>

            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {!pairs && !loadError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </div>
            )}
            {pairs?.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">No hay nada que revisar.</Card>
            )}

            {pairs?.map(pair => (
                <Card key={pair.created.id} className="space-y-3 p-4">
                    {pair.createdBy && (
                        <p className="text-xs text-muted-foreground">Creado por {pair.createdBy}</p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                        {[
                            { keep: pair.created, drop: pair.existing },
                            { keep: pair.existing, drop: pair.created },
                        ].map(({ keep, drop }) => (
                            <div key={keep.id} className="flex flex-col gap-2 rounded-lg border p-3">
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-medium">{keep.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {[keep.blockName, keep.primaryGroup].filter(Boolean).join(' · ')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Usado {keep.uses} {keep.uses === 1 ? 'vez' : 'veces'}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => setMerge({ source: drop, target: keep })}
                                >
                                    Quedarse con este
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => dismissCatalogDuplicateAction(pair.created.id), 'Quitado de la lista')}
                    >
                        No son el mismo
                    </Button>
                </Card>
            ))}

            <AlertDialog open={merge !== null} onOpenChange={open => !open && setMerge(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Fusionar estos ejercicios?</AlertDialogTitle>
                        <AlertDialogDescription>
                            «{merge?.source.name}» desaparece del catálogo y queda como otro nombre de
                            «{merge?.target.name}». Su historial y sus plantillas pasan a este. No se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!merge) return
                                const { source, target } = merge
                                setMerge(null)
                                run(() => mergeCatalogExercisesAction(source.id, target.id), 'Ejercicios fusionados')
                            }}
                        >
                            Fusionar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
