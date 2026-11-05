'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LibraryEntry } from '@/lib/training/workspace-library-actions'
import { normalizeText } from '@/lib/studio/grid-rules'

/** Busca en la biblioteca del espacio y devuelve el ejercicio elegido. */
export function StudioExerciseSearch({ id, label, entries, disabled, onPick }: {
    id: string
    label: string
    entries: LibraryEntry[]
    disabled?: boolean
    onPick: (entry: LibraryEntry) => void
}) {
    const [query, setQuery] = useState('')

    const results = useMemo(() => {
        const search = normalizeText(query)
        if (!search) return []
        return entries
            .filter(entry => !entry.isHidden && (
                normalizeText(entry.name).includes(search) || normalizeText(entry.shortName ?? '').includes(search)
            ))
            .slice(0, 8)
    }, [entries, query])

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                value={query}
                autoComplete="off"
                placeholder="Buscar en tu biblioteca…"
                onChange={event => setQuery(event.target.value)}
            />
            {results.length > 0 && (
                <ul className="divide-y rounded-md border">
                    {results.map(entry => (
                        <li key={entry.catalogExerciseId}>
                            <button
                                type="button"
                                disabled={disabled}
                                className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-muted/60"
                                onClick={() => {
                                    onPick(entry)
                                    setQuery('')
                                }}
                            >
                                <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="min-w-0 truncate">{entry.shortName ?? entry.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {query.trim() && results.length === 0 && (
                <p className="text-sm text-muted-foreground">No está en tu biblioteca.</p>
            )}
        </div>
    )
}
