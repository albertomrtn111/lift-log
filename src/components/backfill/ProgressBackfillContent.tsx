import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatBackfillDate, DayStatusIndicator } from './BackfillModal';
import { Copy, Scale, Footprints, Moon } from 'lucide-react';
import { ProgressBackfillData } from '@/types/running';
import { format } from 'date-fns';

interface ProgressBackfillContentProps {
  days: Date[];
}

export function ProgressBackfillContent({ days }: ProgressBackfillContentProps) {
  const [data, setData] = useState<Record<string, ProgressBackfillData>>(() => {
    const initial: Record<string, ProgressBackfillData> = {};
    days.forEach(day => {
      initial[format(day, 'yyyy-MM-dd')] = { date: format(day, 'yyyy-MM-dd') };
    });
    return initial;
  });

  const updateField = (dateKey: string, field: keyof ProgressBackfillData, value: string) => {
    setData(prev => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        [field]: field === 'notes' ? value : value ? parseFloat(value) : undefined,
      }
    }));
  };

  const copyFromPrevious = (dateKey: string, prevDateKey: string) => {
    const prevData = data[prevDateKey];
    if (prevData?.weight) {
      setData(prev => ({
        ...prev,
        [dateKey]: {
          ...prev[dateKey],
          weight: prevData.weight,
        }
      }));
    }
  };

  const getStatus = (entry: ProgressBackfillData) => {
    const hasWeight = entry.weight !== undefined;
    const hasSteps = entry.steps !== undefined;
    const hasSleep = entry.sleepHours !== undefined;
    
    if (hasWeight && hasSteps && hasSleep) {
      return { isComplete: true, isPartial: false };
    }
    if (hasWeight || hasSteps || hasSleep) {
      return { isComplete: false, isPartial: true };
    }
    return { isComplete: false, isPartial: false };
  };

  const completedCount = Object.values(data).filter(d => {
    const status = getStatus(d);
    return status.isComplete || status.isPartial;
  }).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {completedCount}/{days.length} días con datos
      </p>

      {days.map((day, index) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const prevDateKey = index > 0 ? format(days[index - 1], 'yyyy-MM-dd') : null;
        const entry = data[dateKey] || { date: dateKey };
        const status = getStatus(entry);

        return (
          <div 
            key={dateKey} 
            className="p-3 rounded-lg border border-border bg-card space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm capitalize">
                {formatBackfillDate(day)}
              </span>
              <DayStatusIndicator {...status} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Scale className="h-3 w-3" /> Peso
                </Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="300"
                    placeholder="kg"
                    value={entry.weight ?? ''}
                    onChange={(e) => updateField(dateKey, 'weight', e.target.value)}
                    className="h-8 text-sm"
                  />
                  {prevDateKey && data[prevDateKey]?.weight && (
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
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Footprints className="h-3 w-3" /> Pasos
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="99999"
                  placeholder="pasos"
                  value={entry.steps ?? ''}
                  onChange={(e) => updateField(dateKey, 'steps', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Moon className="h-3 w-3" /> Sueño
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  placeholder="horas"
                  value={entry.sleepHours ?? ''}
                  onChange={(e) => updateField(dateKey, 'sleepHours', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
