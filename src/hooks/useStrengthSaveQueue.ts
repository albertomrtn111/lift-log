'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ExerciseSet, TrainingCell } from '@/types/training'
import { saveTrainingCell } from '@/data/client-schedule'
import {
    addSetFromBase,
    deleteExerciseSet,
    generateOrApplySets,
    getAllSetsForProgram,
    revertSetToBase,
    updateSingleSet,
} from '@/data/exercise-sets'
import {
    applyQueueToCells,
    applyQueueToSets,
    enqueueStrengthChange,
    findSet,
    isTempSetId,
    normalizeStrengthQueue,
    recordStrengthRefusal,
    remapTempSetIds,
    serverCellsAfter,
    serverSetsAfter,
    settleStrengthChange,
    strengthQueueStorageKey,
    tempAliasesFor,
} from '@/lib/training/strength-save-queue'

/**
 * Guardados de Fuerza del atleta que aguantan sin cobertura (NXT-146).
 *
 * Todo cambio entra primero en una cola guardada en el navegador y se envía en
 * orden. Si falla la red, se queda pendiente y se reenvía sola al volver la red,
 * al volver a la pantalla o cada 20 s. La pantalla enseña lo del servidor con la
 * cola encima: una recarga no borra lo que aún no ha llegado.
 * La lógica pura está en src/lib/training/strength-save-queue.js.
 */

export type StrengthSyncStatus = 'idle' | 'saving' | 'offline' | 'retrying'

export interface StrengthMarkDay {
    programId: string
    dayId: string
    week: number
    sessionDate?: string
}

type SetValues = { weightKg?: number | null; reps?: number | null; rir?: number | null }

type Entry = { uid: string; rev?: number; refusals?: number; markDay?: StrengthMarkDay } & (
    | { kind: 'cell'; exerciseId: string; columnId: string; week: number; value: string }
    | { kind: 'generate'; exerciseId: string; week: number; series: number; weightKg: number | null; reps: number | null; rir: number | null }
    | { kind: 'add'; exerciseId: string; week: number; setIndex: number; tempId: string; weightKg: number | null; reps: number | null; rir: number | null }
    | { kind: 'set'; setId: string; exerciseId?: string; week?: number; values: SetValues; override: boolean }
    | { kind: 'delete'; setId: string }
)

/** Lo que se pide encolar (el uid lo pone el hook) */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type StrengthChange = DistributiveOmit<Entry, 'uid' | 'rev' | 'refusals'>

type Outcome = 'ok' | 'refused' | 'network' | 'timeout'

/** Una petición que no responde en este tiempo se da por «sin conexión» */
const SEND_TIMEOUT_MS = 15_000
const RETRY_EVERY_MS = 20_000

let uidCounter = 0
function newUid() {
    uidCounter += 1
    return `${Date.now().toString(36)}-${uidCounter}-${Math.random().toString(36).slice(2, 8)}`
}

function readStoredQueue(key: string): Entry[] {
    try {
        const raw = window.localStorage.getItem(key)
        return raw ? (normalizeStrengthQueue(JSON.parse(raw)) as Entry[]) : []
    } catch {
        return []
    }
}

function writeStoredQueue(key: string, queue: Entry[]) {
    try {
        if (queue.length > 0) window.localStorage.setItem(key, JSON.stringify(queue))
        else window.localStorage.removeItem(key)
    } catch {
        // Modo privado o almacenamiento lleno: la cola sigue en memoria
    }
}

export function useStrengthSaveQueue({
    clientId,
    initialSets,
    initialCells,
    onSaved,
}: {
    clientId: string
    initialSets: ExerciseSet[]
    initialCells: TrainingCell[]
    /** Se llama al confirmar un cambio que cuenta como entrenar (marca el día) */
    onSaved?: (markDay: StrengthMarkDay) => void
}) {
    const storageKey = strengthQueueStorageKey(clientId)
    const [serverSets, setServerSetsState] = useState<ExerciseSet[]>(initialSets)
    const [serverCells, setServerCells] = useState<TrainingCell[]>(initialCells)
    const [queue, setQueueState] = useState<Entry[]>([])
    const [status, setStatus] = useState<StrengthSyncStatus>('idle')

    const serverSetsRef = useRef(serverSets)
    const queueRef = useRef<Entry[]>([])
    const displayedIdsRef = useRef<Set<string>>(new Set())
    /** id real → id temporal que ya enseñaba la pantalla (no rehace las casillas) */
    const aliasesRef = useRef(new Map<string, string>())
    const busyRef = useRef(false)
    /** Petición que pasó del tiempo de espera y sigue en el aire */
    const stuckRef = useRef<Promise<Outcome> | null>(null)
    /** Sube con cada confirmación: una recarga empezada antes se descarta */
    const settlesRef = useRef(0)
    const troubleRef = useRef(false)
    const onSavedRef = useRef(onSaved)
    onSavedRef.current = onSaved
    const flushRef = useRef<() => Promise<void>>(async () => {})

    const setServerSets = useCallback((update: (prev: ExerciseSet[]) => ExerciseSet[]) => {
        serverSetsRef.current = update(serverSetsRef.current)
        setServerSetsState(serverSetsRef.current)
    }, [])

    const commitQueue = useCallback((next: Entry[]) => {
        queueRef.current = next
        setQueueState(next)
        writeStoredQueue(storageKey, next)
    }, [storageKey])

    const sets = useMemo(
        () => applyQueueToSets(serverSets, queue, aliasesRef.current) as ExerciseSet[],
        [serverSets, queue]
    )
    const cells = useMemo(() => applyQueueToCells(serverCells, queue) as TrainingCell[], [serverCells, queue])
    displayedIdsRef.current = new Set(sets.map(s => s.id))

    /** Envía una entrada y aplica la respuesta. Nunca lanza. */
    const deliver = useCallback(async (entry: Entry): Promise<Outcome> => {
        const sentRev = entry.rev ?? 1
        const realIdOf = (setId: string) => {
            if (!isTempSetId(setId)) return setId
            const found = findSet(serverSetsRef.current, setId)
            return found && !isTempSetId(found.id) ? found.id : null
        }

        let ok = false
        let result: { sets?: ExerciseSet[]; set?: ExerciseSet; setId?: string } = {}
        try {
            switch (entry.kind) {
                case 'cell': {
                    const res = await saveTrainingCell(entry.exerciseId, entry.columnId, entry.week, entry.value)
                    ok = res.success
                    break
                }
                case 'generate': {
                    const res = await generateOrApplySets(entry.exerciseId, entry.week, entry.series, entry.weightKg, entry.reps, entry.rir)
                    ok = res.success && !!res.sets
                    result = { sets: res.sets }
                    break
                }
                case 'add': {
                    const res = await addSetFromBase(entry.exerciseId, entry.week, entry.weightKg, entry.reps, entry.rir, entry.setIndex)
                    ok = res.success && !!res.set
                    result = { set: res.set }
                    break
                }
                case 'set': {
                    const id = realIdOf(entry.setId)
                    if (!id) {
                        // Su serie no llegó a crearse: no hay nada que guardar
                        commitQueue(queueRef.current.filter(e => e.uid !== entry.uid))
                        return 'ok'
                    }
                    const v = entry.values
                    const res = entry.override
                        ? await updateSingleSet(id, v)
                        : await revertSetToBase(id, v.weightKg ?? null, v.reps ?? null, v.rir ?? null)
                    ok = res.success
                    result = { set: res.set }
                    break
                }
                case 'delete': {
                    const id = realIdOf(entry.setId)
                    if (!id) {
                        commitQueue(queueRef.current.filter(e => e.uid !== entry.uid))
                        return 'ok'
                    }
                    const res = await deleteExerciseSet(id)
                    // Si ya no estaba (un intento anterior llegó), está hecho
                    ok = res.success || res.error === 'Set not deleted'
                    result = { setId: id }
                    break
                }
            }
        } catch (error) {
            console.warn('[fuerza] sin conexión al guardar, queda pendiente', error)
            return 'network'
        }

        if (!ok) {
            const { queue: next, dropped } = recordStrengthRefusal(queueRef.current, entry.uid, sentRev)
            commitQueue(next as Entry[])
            if (dropped) {
                toast.error('No se pudo guardar un cambio de Fuerza. Revisa esa serie y vuelve a apuntarla.')
            }
            return 'refused'
        }

        settlesRef.current += 1
        if (entry.kind === 'cell') {
            setServerCells(prev => serverCellsAfter(prev, entry) as TrainingCell[])
        } else {
            const created = entry.kind === 'generate' ? (result.sets ?? []) : entry.kind === 'add' && result.set ? [result.set] : []
            for (const [realId, tempId] of tempAliasesFor(created, displayedIdsRef.current)) {
                aliasesRef.current.set(realId, tempId)
            }
            setServerSets(prev => serverSetsAfter(prev, entry, result) as ExerciseSet[])
        }

        const settled = settleStrengthChange(queueRef.current, entry.uid, sentRev)
        let next = settled.queue as Entry[]
        if (entry.kind === 'generate' || entry.kind === 'add') next = remapTempSetIds(next, serverSetsRef.current) as Entry[]
        // La serie se borró mientras se creaba: se borra también la creada
        if (!settled.found && entry.kind === 'add' && result.set) {
            next = enqueueStrengthChange(next, { uid: newUid(), kind: 'delete', setId: result.set.id }) as Entry[]
        }
        commitQueue(next)
        if (entry.markDay) onSavedRef.current?.(entry.markDay)
        return 'ok'
    }, [commitQueue, setServerSets])

    const flush = useCallback(async () => {
        if (busyRef.current || stuckRef.current) return
        if (queueRef.current.length === 0) {
            setStatus('idle')
            return
        }
        busyRef.current = true
        setStatus('saving')
        let final: StrengthSyncStatus = 'idle'
        try {
            while (queueRef.current.length > 0) {
                const attempt = deliver(queueRef.current[0])
                let timer: ReturnType<typeof setTimeout> | undefined
                const outcome = await Promise.race<Outcome>([
                    attempt,
                    new Promise<Outcome>(resolve => { timer = setTimeout(() => resolve('timeout'), SEND_TIMEOUT_MS) }),
                ])
                clearTimeout(timer)
                if (outcome === 'timeout') {
                    // No se repite mientras siga en el aire; al terminar se sigue
                    stuckRef.current = attempt
                    void attempt.finally(() => {
                        stuckRef.current = null
                        void flushRef.current()
                    })
                    final = 'offline'
                    break
                }
                if (outcome === 'network') { final = 'offline'; break }
                if (outcome === 'refused') { final = 'retrying'; break }
            }
        } finally {
            busyRef.current = false
        }
        if (queueRef.current.length === 0) final = 'idle'
        setStatus(final)
        if (final === 'idle' && troubleRef.current) {
            troubleRef.current = false
            toast.success('Todo guardado. Tus series ya están al día.')
        } else if (final !== 'idle') {
            troubleRef.current = true
        }
    }, [deliver])
    flushRef.current = flush

    /** Añade un cambio (la pantalla lo enseña al momento) e intenta enviarlo. */
    const enqueue = useCallback((change: StrengthChange) => {
        const entry = { ...change, uid: newUid() } as Entry
        // La pantalla puede seguir enseñando el id temporal de una serie ya creada
        if (entry.kind === 'set' || entry.kind === 'delete') {
            for (const [realId, tempId] of aliasesRef.current) {
                if (tempId === entry.setId) { entry.setId = realId; break }
            }
        }
        commitQueue(enqueueStrengthChange(queueRef.current, entry) as Entry[])
        void flushRef.current()
    }, [commitQueue])

    /** Relee las series del servidor (la cola sigue encima). */
    const refreshSets = useCallback(async (exerciseIds: string[]) => {
        if (exerciseIds.length === 0) return
        const before = settlesRef.current
        try {
            const fresh = await getAllSetsForProgram(exerciseIds)
            if (settlesRef.current === before) setServerSets(() => fresh)
        } catch (error) {
            console.error('[fuerza] no se pudieron recargar las series', error)
        }
    }, [setServerSets])

    // Lo que quedó pendiente de otra vez (recarga, app cerrada) se recupera y se envía
    useEffect(() => {
        const stored = readStoredQueue(storageKey)
        if (stored.length > 0) {
            const known = new Set(stored.map(e => e.uid))
            commitQueue([...stored, ...queueRef.current.filter(e => !known.has(e.uid))])
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                setStatus('offline')
                troubleRef.current = true
            }
            void flushRef.current()
        }
    }, [storageKey, commitQueue])

    // Reintentos: al volver la red y, mientras quede algo, cada 20 s
    const hasPending = queue.length > 0
    useEffect(() => {
        const onOnline = () => { void flushRef.current() }
        const onOffline = () => {
            if (queueRef.current.length > 0) {
                setStatus('offline')
                troubleRef.current = true
            }
        }
        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        const interval = hasPending
            ? setInterval(() => {
                if (document.visibilityState === 'visible') void flushRef.current()
            }, RETRY_EVERY_MS)
            : undefined
        return () => {
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
            if (interval) clearInterval(interval)
        }
    }, [hasPending])

    return {
        sets,
        cells,
        status,
        pendingCount: queue.length,
        enqueue,
        flush,
        refreshSets,
    }
}
