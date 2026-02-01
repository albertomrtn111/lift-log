import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, Footprints, Zap, TrendingUp, Route } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionType } from '@/types/running';

interface RecentSession {
  date: string;
  name: string;
  type: SessionType;
  distance: number;
  duration: number;
  pace: string;
}

interface RecentSessionsListProps {
  sessions: RecentSession[];
}

const typeIcons: Record<SessionType, React.ComponentType<{ className?: string }>> = {
  easy: Footprints,
  recovery: Footprints,
  intervals: Zap,
  tempo: TrendingUp,
  long: Route,
  rest: Footprints,
};

export function RecentSessionsList({ sessions }: RecentSessionsListProps) {
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3 text-sm">Últimas sesiones</h3>
      
      <div className="space-y-2">
        {sessions.map((session, index) => {
          const Icon = typeIcons[session.type];
          
          return (
            <div 
              key={index}
              className="flex items-center gap-3 py-2 border-b border-border last:border-0"
            >
              <span className="text-xs text-muted-foreground w-14">
                {format(new Date(session.date), 'EEE d', { locale: es })}
              </span>
              
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              
              <span className="text-sm flex-1 truncate">{session.name}</span>
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{session.distance} km</span>
                <span className="text-border">•</span>
                <span>{session.duration}'</span>
              </div>
              
              <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
                <Check className="h-3 w-3 text-success" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
