import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WeekNavigationProps {
  currentWeek: number;
  totalWeeks: number;
  onWeekChange: (week: number) => void;
}

export function WeekNavigation({ currentWeek, totalWeeks, onWeekChange }: WeekNavigationProps) {
  const canGoPrev = currentWeek > 1;
  const canGoNext = currentWeek < totalWeeks;

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onWeekChange(currentWeek - 1)}
        disabled={!canGoPrev}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      
      <div className="text-center">
        <span className="font-semibold">Semana {currentWeek}</span>
        <span className="text-sm text-muted-foreground ml-1">/ {totalWeeks}</span>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onWeekChange(currentWeek + 1)}
        disabled={!canGoNext}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
