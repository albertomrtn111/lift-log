import { TrainingDay } from '@/types/training';
import { cn } from '@/lib/utils';

interface DayTabsProps {
  days: TrainingDay[];
  selectedDayId: string;
  onSelectDay: (dayId: string) => void;
}

const WEEKDAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function DayTabs({ days, selectedDayId, onSelectDay }: DayTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide" role="tablist" aria-label="Días de entrenamiento">
      {days.map((day) => {
        const isActive = selectedDayId === day.id;
        const weekday = day.defaultWeekday ?? day.default_weekday;

        return (
          <button
            key={day.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectDay(day.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {weekday ? (
              <span className={cn('text-[11px] font-semibold uppercase', isActive ? 'text-primary-foreground/75' : 'text-muted-foreground/80')}>
                {WEEKDAY_SHORT[weekday]}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{day.name}</span>
          </button>
        );
      })}
    </div>
  );
}
