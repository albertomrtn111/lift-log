'use client'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatLoggedSets, formatProgramPeriod } from '@/lib/training/program-selector'
import type { ProgramSummary } from '@/app/(coach)/coach/workspace/training-progress-actions'

interface ProgramSelectorProps {
    programs: ProgramSummary[]
    selectedId: string
    onSelect: (id: string) => void
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    active: { label: 'Activo', variant: 'default' },
    draft: { label: 'Borrador', variant: 'secondary' },
    archived: { label: 'Archivado', variant: 'outline' },
    completed: { label: 'Completado', variant: 'outline' },
}

function StatusBadge({ status, className }: { status: string; className?: string }) {
    const st = STATUS_LABELS[status] || STATUS_LABELS.draft
    return (
        <Badge variant={st.variant} className={cn('shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px]', className)}>
            {st.label}
        </Badge>
    )
}

export function ProgramSelector({ programs, selectedId, onSelect }: ProgramSelectorProps) {
    if (programs.length === 0) return null

    const selected = programs.find(p => p.id === selectedId)

    return (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span id="program-selector-label" className="shrink-0 text-sm font-medium text-muted-foreground">Programa:</span>
            <Select value={selectedId} onValueChange={onSelect}>
                <SelectTrigger
                    aria-labelledby="program-selector-label"
                    title={selected?.name}
                    className="w-full min-w-0 sm:w-[340px]"
                >
                    {/* Contenido propio: en el recuadro, nombre en una línea con «…» y la etiqueta al lado. */}
                    <SelectValue placeholder="Seleccionar programa">
                        {selected ? (
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 truncate">{selected.name}</span>
                                <StatusBadge status={selected.status} />
                            </span>
                        ) : null}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-[min(26rem,var(--radix-select-content-available-width))]">
                    {programs.map(p => {
                        const period = formatProgramPeriod(p)
                        const logged = formatLoggedSets(p.loggedSets)
                        const meta = [period, logged].filter(Boolean).join(' · ')
                        return (
                            <SelectItem key={p.id} value={p.id} textValue={p.name} className="items-start py-2">
                                {/* En la lista, el nombre completo (en varias líneas si hace falta). */}
                                <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
                                    <span className="flex min-w-0 items-start gap-2">
                                        <span className="min-w-0 break-words font-medium leading-snug">{p.name}</span>
                                        <StatusBadge status={p.status} className="mt-0.5" />
                                    </span>
                                    {meta && (
                                        <span
                                            className={cn(
                                                'text-xs text-muted-foreground',
                                                p.loggedSets === 0 && 'text-muted-foreground/80'
                                            )}
                                        >
                                            {meta}
                                        </span>
                                    )}
                                </span>
                            </SelectItem>
                        )
                    })}
                </SelectContent>
            </Select>
        </div>
    )
}
