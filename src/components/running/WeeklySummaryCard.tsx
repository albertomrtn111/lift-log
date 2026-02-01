import { Card } from '@/components/ui/card';
import { WeeklySummary } from '@/types/running';
import { TrendingUp, CheckCircle2 } from 'lucide-react';

interface WeeklySummaryCardProps {
  summary: WeeklySummary;
}

export function WeeklySummaryCard({ summary }: WeeklySummaryCardProps) {
  const distancePercent = Math.round((summary.completedDistance / summary.plannedDistance) * 100);

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Resumen semanal</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Distancia</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{summary.completedDistance}</span>
            <span className="text-muted-foreground">/ {summary.plannedDistance} km</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(distancePercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm text-muted-foreground">Sesiones</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{summary.completedSessions}</span>
            <span className="text-muted-foreground">/ {summary.plannedSessions}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${(summary.completedSessions / summary.plannedSessions) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
