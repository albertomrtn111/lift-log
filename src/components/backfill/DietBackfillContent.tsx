import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { formatBackfillDate, DayStatusIndicator } from './BackfillModal';
import { Copy } from 'lucide-react';
import { DietBackfillData } from '@/types/running';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DietBackfillContentProps {
  days: Date[];
}

export function DietBackfillContent({ days }: DietBackfillContentProps) {
  const [data, setData] = useState<Record<string, DietBackfillData>>(() => {
    const initial: Record<string, DietBackfillData> = {};
    days.forEach(day => {
      initial[format(day, 'yyyy-MM-dd')] = { date: format(day, 'yyyy-MM-dd') };
    });
    return initial;
  });

  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

  const updateAdherence = (dateKey: string, value: number) => {
    setData(prev => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        adherencePercent: value,
      }
    }));
  };

  const updateNotes = (dateKey: string, value: string) => {
    setData(prev => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        notes: value,
      }
    }));
  };

  const copyFromPrevious = (dateKey: string, prevDateKey: string) => {
    const prevData = data[prevDateKey];
    if (prevData?.adherencePercent !== undefined) {
      setData(prev => ({
        ...prev,
        [dateKey]: {
          ...prev[dateKey],
          adherencePercent: prevData.adherencePercent,
        }
      }));
    }
  };

  const getStatus = (entry: DietBackfillData) => {
    if (entry.adherencePercent !== undefined) {
      return { isComplete: true, isPartial: false };
    }
    if (entry.notes) {
      return { isComplete: false, isPartial: true };
    }
    return { isComplete: false, isPartial: false };
  };

  const completedCount = Object.values(data).filter(d => getStatus(d).isComplete).length;

  const getAdherenceColor = (percent?: number) => {
    if (percent === undefined) return 'text-muted-foreground';
    if (percent >= 90) return 'text-success';
    if (percent >= 70) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {completedCount}/{days.length} días completados
      </p>

      {days.map((day, index) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const prevDateKey = index > 0 ? format(days[index - 1], 'yyyy-MM-dd') : null;
        const entry = data[dateKey] || { date: dateKey };
        const status = getStatus(entry);
        const isExpanded = expandedNotes === dateKey;

        return (
          <div 
            key={dateKey} 
            className="p-3 rounded-lg border border-border bg-card space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm capitalize">
                {formatBackfillDate(day)}
              </span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-semibold",
                  getAdherenceColor(entry.adherencePercent)
                )}>
                  {entry.adherencePercent !== undefined ? `${entry.adherencePercent}%` : '—'}
                </span>
                <DayStatusIndicator {...status} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Slider
                  value={[entry.adherencePercent ?? 0]}
                  onValueChange={([value]) => updateAdherence(dateKey, value)}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                {prevDateKey && data[prevDateKey]?.adherencePercent !== undefined && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => copyFromPrevious(dateKey, prevDateKey)}
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
                  placeholder="¿Alguna observación del día?"
                  value={entry.notes ?? ''}
                  onChange={(e) => updateNotes(dateKey, e.target.value)}
                  className="min-h-[60px] resize-none text-sm"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
