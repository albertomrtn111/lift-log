import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeekSelectorProps {
  totalWeeks: number;
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  className?: string;
}

// Selector compacto de semana del programa: ‹ Semana 3 de 12 › + progreso
export function WeekSelector({ totalWeeks, selectedWeek, onSelectWeek, className }: WeekSelectorProps) {
  const canPrev = selectedWeek > 1;
  const canNext = selectedWeek < totalWeeks;
  const progress = totalWeeks > 0 ? selectedWeek / totalWeeks : 0;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="inline-flex shrink-0 items-center rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => canPrev && onSelectWeek(selectedWeek - 1)}
          disabled={!canPrev}
          aria-label="Semana anterior"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[6.5rem] px-1 text-center text-sm font-semibold tabular-nums">
          Semana {selectedWeek}
          <span className="font-normal text-muted-foreground"> / {totalWeeks}</span>
        </span>
        <button
          type="button"
          onClick={() => canNext && onSelectWeek(selectedWeek + 1)}
          disabled={!canNext}
          aria-label="Semana siguiente"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="min-w-0 flex-1" aria-label={`Semana ${selectedWeek} de ${totalWeeks} del programa`}>
        <div className="flex gap-0.5">
          {Array.from({ length: totalWeeks }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onSelectWeek(index + 1)}
              aria-label={`Ir a la semana ${index + 1}`}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                index + 1 === selectedWeek ? 'bg-primary' : index + 1 < selectedWeek ? 'bg-primary/35' : 'bg-muted'
              )}
            />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          {Math.round(progress * 100)}% del programa
        </p>
      </div>
    </div>
  );
}
