import { cn } from '@/lib/utils';

interface WeekSelectorProps {
  totalWeeks: number;
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
}

export function WeekSelector({ totalWeeks, selectedWeek, onSelectWeek }: WeekSelectorProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => (
        <button
          key={week}
          onClick={() => onSelectWeek(week)}
          className={cn(
            'week-pill shrink-0',
            selectedWeek === week && 'week-pill-active'
          )}
        >
          Semana {week}
        </button>
      ))}
    </div>
  );
}
