import { TrainingDay } from '@/types/training';
import { cn } from '@/lib/utils';

interface DayTabsProps {
  days: TrainingDay[];
  selectedDayId: string;
  onSelectDay: (dayId: string) => void;
}

export function DayTabs({ days, selectedDayId, onSelectDay }: DayTabsProps) {
  return (
    <div className="flex overflow-x-auto border-b border-border scrollbar-hide">
      {days.map((day) => (
        <button
          key={day.id}
          onClick={() => onSelectDay(day.id)}
          className={cn(
            'day-tab shrink-0',
            selectedDayId === day.id && 'day-tab-active'
          )}
        >
          {day.name}
        </button>
      ))}
    </div>
  );
}
