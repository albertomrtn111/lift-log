'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Scale, Footprints, Moon, Check, Loader2, ListTodo } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { BackfillModal } from '@/components/backfill/BackfillModal'
import { ProgressBackfillContent } from '@/components/backfill/ProgressBackfillContent'
import {
    getClientMetrics,
    saveClientMetrics,
} from '@/data/progress'

interface RegistrarSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved?: () => void
}

export function RegistrarSheet({ open, onOpenChange, onSaved }: RegistrarSheetProps) {
    const router = useRouter()
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [weight, setWeight] = useState('')
    const [steps, setSteps] = useState('')
    const [sleep, setSleep] = useState('')
    const [notes, setNotes] = useState('')
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [isLoading, setIsLoading] = useState(false)
    const [backfillOpen, setBackfillOpen] = useState(false)

    // Load existing metrics when date or sheet opens
    useEffect(() => {
        if (!open) return
        let isMounted = true

        async function load() {
            setIsLoading(true)
            try {
                const data = await getClientMetrics(selectedDate)
                if (!isMounted) return
                if (data) {
                    setWeight(data.weight_kg?.toString() ?? '')
                    setSteps(data.steps?.toString() ?? '')
                    setSleep(data.sleep_h?.toString() ?? '')
                    setNotes(data.notes ?? '')
                } else {
                    setWeight('')
                    setSteps('')
                    setSleep('')
                    setNotes('')
                }
            } catch {
                // silent
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }
        load()
        return () => { isMounted = false }
    }, [open, selectedDate])

    const handleSave = async () => {
        setSaveStatus('saving')
        try {
            const result = await saveClientMetrics({
                metric_date: format(selectedDate, 'yyyy-MM-dd'),
                weight_kg: weight ? parseFloat(weight) : undefined,
                steps: steps ? parseInt(steps) : undefined,
                sleep_h: sleep ? parseFloat(sleep) : undefined,
                notes: notes || undefined,
            })

            if (result.success) {
                setSaveStatus('saved')
                onSaved?.()
                setTimeout(() => {
                    setSaveStatus('idle')
                    onOpenChange(false)
                }, 1200)
            } else {
                setSaveStatus('idle')
                if (result.sessionExpired) {
                    toast.error('Tu sesión ha caducado. Redirigiendo...')
                    setTimeout(() => router.push('/login'), 2000)
                } else {
                    toast.error('Error al guardar: ' + result.error)
                }
            }
        } catch {
            setSaveStatus('idle')
            toast.error('Error inesperado. Por favor recarga la página.')
        }
    }

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto p-0">
                    <SheetHeader className="px-4 pt-5 pb-3 border-b">
                        <div className="flex items-center justify-between">
                            <SheetTitle className="text-base">Registrar métricas</SheetTitle>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                                        <CalendarIcon className="h-3.5 w-3.5" />
                                        {format(selectedDate, "d MMM", { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={(d) => d && setSelectedDate(d)}
                                        locale={es}
                                        className="pointer-events-auto"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </SheetHeader>

                    <div className="px-4 py-4 space-y-3">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {/* Peso */}
                                <div className="flex items-center gap-3 rounded-xl border p-3">
                                    <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Scale className="h-4.5 w-4.5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground mb-1">Peso <span className="text-muted-foreground/60">(kg)</span></p>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            placeholder="78.5"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                            className="h-8 text-base border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
                                        />
                                    </div>
                                </div>

                                {/* Pasos */}
                                <div className="flex items-center gap-3 rounded-xl border p-3">
                                    <div className="w-9 h-9 shrink-0 rounded-lg bg-success/10 flex items-center justify-center">
                                        <Footprints className="h-4.5 w-4.5 text-success" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground mb-1">Pasos</p>
                                        <Input
                                            type="number"
                                            placeholder="10 000"
                                            value={steps}
                                            onChange={(e) => setSteps(e.target.value)}
                                            className="h-8 text-base border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
                                        />
                                    </div>
                                </div>

                                {/* Sueño */}
                                <div className="flex items-center gap-3 rounded-xl border p-3">
                                    <div className="w-9 h-9 shrink-0 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                        <Moon className="h-4.5 w-4.5 text-indigo-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground mb-1">Sueño <span className="text-muted-foreground/60">(horas)</span></p>
                                        <Input
                                            type="number"
                                            step="0.5"
                                            placeholder="7.5"
                                            value={sleep}
                                            onChange={(e) => setSleep(e.target.value)}
                                            className="h-8 text-base border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
                                        />
                                    </div>
                                </div>

                                {/* Notas */}
                                <div className="rounded-xl border p-3">
                                    <p className="text-xs text-muted-foreground mb-2">Notas del día</p>
                                    <Textarea
                                        placeholder="¿Cómo te has sentido hoy?"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="min-h-[72px] resize-none border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent text-sm"
                                    />
                                </div>

                                {/* Guardar */}
                                <Button
                                    onClick={handleSave}
                                    className="w-full"
                                    size="lg"
                                    disabled={saveStatus === 'saving'}
                                >
                                    {saveStatus === 'saving' ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</>
                                    ) : saveStatus === 'saved' ? (
                                        <><Check className="h-4 w-4 mr-2" /> Guardado</>
                                    ) : (
                                        'Guardar'
                                    )}
                                </Button>

                                {/* Backfill secundario */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full gap-2 text-muted-foreground"
                                    onClick={() => setBackfillOpen(true)}
                                >
                                    <ListTodo className="h-4 w-4" />
                                    Rellenar días pendientes
                                </Button>
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <BackfillModal
                open={backfillOpen}
                onOpenChange={setBackfillOpen}
                title="Rellenar métricas pendientes"
            >
                {({ days, onClose }) => (
                    <ProgressBackfillContent
                        days={days}
                        onClose={onClose}
                        onSuccess={() => { onSaved?.() }}
                    />
                )}
            </BackfillModal>
        </>
    )
}
