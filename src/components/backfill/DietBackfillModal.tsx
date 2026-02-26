
import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, Circle, CircleDot, Save, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { getDietAdherenceLogs, saveDietAdherenceLogs, DietAdherenceLog } from '@/data/diet-adherence';
import { toast } from 'sonner';

interface DietBackfillModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type RangeOption = 7 | 14;

interface DailyData {
    date: Date;
    adherence_pct: number | null;
    notes: string | null;
    status: 'complete' | 'partial' | 'empty';
}

export function DietBackfillModal({ open, onOpenChange }: DietBackfillModalProps) {
    const [range, setRange] = useState<RangeOption>(7);
    const [days, setDays] = useState<DailyData[]>([]);
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

    // Load data when open or range changes
    useEffect(() => {
        if (!open) return;

        async function load() {
            setLoading(true);
            try {
                const today = new Date();
                const startDate = subDays(today, range - 1); // e.g. today - 6 days = 7 days total

                // Fetch existing logs
                const logs = await getDietAdherenceLogs(startDate, today);

                // Merge with range
                const daysData: DailyData[] = [];
                for (let i = 0; i < range; i++) {
                    const d = subDays(today, range - 1 - i);
                    const log = logs.find(l =>
                        format(new Date(l.log_date), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')
                    );

                    daysData.push({
                        date: d,
                        adherence_pct: log?.adherence_pct ?? null,
                        notes: log?.notes ?? null,
                        status: log?.adherence_pct !== null ? 'complete' : (log?.notes ? 'partial' : 'empty')
                    });
                }

                setDays(daysData);
            } catch (error) {
                console.error('Failed to load backfill data', error);
                toast.error('Error al cargar datos anteriores');
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [open, range]);

    const handleSaveAll = async () => {
        setSaveStatus('saving');
        try {
            // Filter only modified or relevant days? Or just save all in range?
            // User requirement: "Insertar los que no existen aún".
            // Since we use upsert, we can save all.
            const logsToSave = days.map(d => ({
                date: d.date,
                adherence_pct: d.adherence_pct,
                notes: d.notes
            }));

            const res = await saveDietAdherenceLogs(logsToSave);

            if (res.success) {
                setSaveStatus('saved');
                toast.success('Historial guardado');
                setTimeout(() => {
                    setSaveStatus('idle');
                    onOpenChange(false);
                }, 1000);
            } else {
                setSaveStatus('idle');
                toast.error('Error al guardar: ' + res.error);
            }
        } catch (error) {
            setSaveStatus('idle');
            toast.error('Error inesperado');
        }
    };

    const updateAdherence = (index: number, val: number) => {
        const newDays = [...days];
        newDays[index].adherence_pct = val;
        // Update status
        newDays[index].status = 'complete';
        setDays(newDays);
    };

    const updateNotes = (index: number, val: string) => {
        const newDays = [...days];
        newDays[index].notes = val;
        if (newDays[index].adherence_pct === null) {
            newDays[index].status = 'partial';
        }
        setDays(newDays);
    };

    const copyFromPrevious = (index: number) => {
        if (index <= 0) return;
        const prev = days[index - 1];
        if (prev.adherence_pct !== null) {
            updateAdherence(index, prev.adherence_pct);
        }
    };

    const getAdherenceColor = (percent: number | null) => {
        if (percent === null) return 'text-muted-foreground';
        if (percent >= 90) return 'text-success';
        if (percent >= 70) return 'text-warning';
        return 'text-destructive';
    };

    const completedCount = days.filter(d => d.status === 'complete').length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Rellenar adherencia pendiente</DialogTitle>
                </DialogHeader>

                <div className="flex gap-2 py-2">
                    <Button
                        variant={range === 7 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setRange(7)}
                    >
                        7 días
                    </Button>
                    <Button
                        variant={range === 14 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setRange(14)}
                    >
                        14 días
                    </Button>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {completedCount}/{days.length} días completados
                        </p>

                        {days.map((day, index) => {
                            const dateKey = format(day.date, 'yyyy-MM-dd');
                            const isExpanded = expandedNotes === dateKey;

                            return (
                                <div key={dateKey} className="p-3 rounded-lg border border-border bg-card space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm capitalize">
                                            {format(day.date, "EEE, d MMM", { locale: es })}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={cn("text-sm font-semibold", getAdherenceColor(day.adherence_pct))}>
                                                {day.adherence_pct !== null ? `${day.adherence_pct}%` : '—'}
                                            </span>
                                            <DayStatusIndicator status={day.status} />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Slider
                                                value={[day.adherence_pct ?? 0]}
                                                onValueChange={([val]) => updateAdherence(index, val)}
                                                max={100}
                                                step={5}
                                                className="flex-1"
                                            />
                                            {index > 0 && days[index - 1].adherence_pct !== null && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0"
                                                    onClick={() => copyFromPrevious(index)}
                                                    title="Copiar del día anterior"
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-xs text-muted-foreground"
                                            onClick={() => setExpandedNotes(isExpanded ? null : dateKey)}
                                        >
                                            {isExpanded ? 'Ocultar notas' : 'Añadir nota'}
                                        </Button>

                                        {isExpanded && (
                                            <Textarea
                                                placeholder="¿Alguna observación?"
                                                value={day.notes ?? ''}
                                                onChange={(e) => updateNotes(index, e.target.value)}
                                                className="min-h-[60px] resize-none text-sm"
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="pt-4 border-t border-border">
                    <Button
                        onClick={handleSaveAll}
                        className="w-full"
                        size="lg"
                        disabled={saveStatus === 'saving' || loading}
                    >
                        {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? 'Guardado' : 'Guardar todo'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function DayStatusIndicator({ status }: { status: 'complete' | 'partial' | 'empty' }) {
    if (status === 'complete') return <Check className="h-4 w-4 text-success" />;
    if (status === 'partial') return <CircleDot className="h-4 w-4 text-warning" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
}
