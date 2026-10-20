'use client'

import { useEffect, useState } from 'react'
import { loadExerciseCatalog } from '@/lib/training/exercise-catalog-client'
import type { CatalogExercise } from '@/lib/training/exercise-catalog'

// Catálogo compartido entre todos los selectores de la página: un ejercicio
// creado en uno aparece al momento en los demás.
let cache: CatalogExercise[] | null = null
let pending: Promise<CatalogExercise[]> | null = null
const listeners = new Set<(exercises: CatalogExercise[]) => void>()

function publish(next: CatalogExercise[]) {
    cache = next
    listeners.forEach(listener => listener(next))
}

function loadOnce(): Promise<CatalogExercise[]> {
    if (!pending) {
        pending = loadExerciseCatalog()
            .then(data => {
                publish(data)
                return data
            })
            .catch(cause => {
                pending = null
                throw cause
            })
    }
    return pending
}

export function addExerciseToCatalogCache(exercise: CatalogExercise) {
    const current = cache ?? []
    if (current.some(item => item.id === exercise.id)) return
    publish([...current, exercise].sort((a, b) => a.name.localeCompare(b.name, 'es')))
}

export function useExerciseCatalog() {
    const [exercises, setExercises] = useState<CatalogExercise[]>(cache ?? [])
    const [loading, setLoading] = useState(cache === null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        listeners.add(setExercises)
        if (cache === null) {
            loadOnce()
                .catch(cause => {
                    if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.')
                })
                .finally(() => {
                    if (active) setLoading(false)
                })
        }
        return () => {
            active = false
            listeners.delete(setExercises)
        }
    }, [])

    return { exercises, loading, error }
}
