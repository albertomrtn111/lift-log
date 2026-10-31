import { TrainingDay } from '@/types/training';
import { ClientChipTabs } from '@/components/ui/client-tab-switcher';

interface DayTabsProps {
  days: TrainingDay[];
  selectedDayId: string;
  onSelectDay: (dayId: string) => void;
}

const WEEKDAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function DayTabs({ days, selectedDayId, onSelectDay }: DayTabsProps) {
  return (
    <ClientChipTabs
      aria-label="Días de entrenamiento"
      className="pb-2"
      listClassName="px-4"
      value={selectedDayId}
      onValueChange={onSelectDay}
      options={days.map((day) => {
        const weekday = day.defaultWeekday ?? day.default_weekday;
        return {
          value: day.id,
          label: day.name,
          prefix: weekday ? WEEKDAY_SHORT[weekday] : undefined,
        };
      })}
    />
  );
}
