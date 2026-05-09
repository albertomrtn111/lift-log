'use client'

import { useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Camera, ImageOff, ClipboardCheck, Send } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ClientReviewScheduleWithTemplate } from '@/data/review-schedules'

interface ReviewScheduleSelectorDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    clientName: string
    schedules: ClientReviewScheduleWithTemplate[]
    onSelect: (scheduleId: string) => void
    isSending: boolean
}

export function ReviewScheduleSelectorDialog({
    open,
    onOpenChange,
    clientName,
    schedules,
    onSelect,
    isSending,
}: ReviewScheduleSelectorDialogProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [, startTransition] = useTransition()

    const handleConfirm = () => {
        if (!selectedId) return
        startTransition(() => {
            onSelect(selectedId)
        })
    }

    return (
        <Dialog open={open} onOpenChange={(v) => {
            onOpenChange(v)
            if (!v) setSelectedId(null)
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>¿Qué revisión enviar a {clientName}?</DialogTitle>
                    <DialogDescription>
                        Este atleta tiene varias revisiones activas. Elige cuál enviarle ahora.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-2">
                    {schedules.map(s => {
                        const tpl = s.review_template
                        const groups: string[] = []
                        if (tpl?.include_body_metrics) groups.push('Cuerpo')
                        if (tpl?.include_performance_metrics) groups.push('Rendimiento')
                        if (tpl?.include_general_metrics) groups.push('General')

                        const isSelected = selectedId === s.id
                        const dueLabel = formatDue(s.next_due_date)

                        return (
                            <Card
                                key={s.id}
                                onClick={() => setSelectedId(s.id)}
                                className={`p-3 cursor-pointer transition-colors ${
                                    isSelected
                                        ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                                        : 'hover:bg-muted/40'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                    }`}>
                                        <ClipboardCheck className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm">{tpl?.name ?? 'Plantilla'}</span>
                                            <Badge variant="outline" className="text-[10px]">
                                                Cada {s.frequency_days}d
                                            </Badge>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                            <span>Próxima: {dueLabel}</span>
                                            {groups.length > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span>{groups.join(' / ')}</span>
                                                </>
                                            )}
                                            <span>·</span>
                                            <span className="inline-flex items-center gap-1">
                                                {tpl?.include_progress_photos
                                                    ? <><Camera className="h-3 w-3" /> Fotos</>
                                                    : <><ImageOff className="h-3 w-3" /> Sin fotos</>}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )
                    })}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedId || isSending} className="gap-1.5">
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar revisión
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function formatDue(dateStr: string | null): string {
    if (!dateStr) return 'Sin fecha'
    try {
        return format(parseISO(dateStr), "d MMM yyyy", { locale: es })
    } catch {
        return dateStr
    }
}
