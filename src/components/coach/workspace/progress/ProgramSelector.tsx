'use client'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
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

export function ProgramSelector({ programs, selectedId, onSelect }: ProgramSelectorProps) {
    if (programs.length === 0) return null

    return (
        <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground shrink-0">Programa:</span>
            <Select value={selectedId} onValueChange={onSelect}>
                <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Seleccionar programa" />
                </SelectTrigger>
                <SelectContent>
                    {programs.map(p => {
                        const st = STATUS_LABELS[p.status] || STATUS_LABELS.draft
                        return (
                            <SelectItem key={p.id} value={p.id}>
                                <div className="flex items-center gap-2">
                                    <span>{p.name}</span>
                                    <Badge variant={st.variant} className="text-[10px] px-1.5 py-0">
                                        {st.label}
                                    </Badge>
                                </div>
                            </SelectItem>
                        )
                    })}
                </SelectContent>
            </Select>
        </div>
    )
}
