import { RunningSession, SessionType } from '@/types/running';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Footprints, 
  Zap, 
  TrendingUp, 
  Route, 
  Moon, 
  Check, 
  ChevronRight,
  Minus 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunningDayCardProps {
  session: RunningSession;
  onClick: () => void;
}

const typeConfig: Record<SessionType, { 
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  easy: { 
    icon: Footprints, 
    color: 'text-success',
    bgColor: 'bg-success/10'
  },
  recovery: { 
    icon: Footprints, 
    color: 'text-success',
    bgColor: 'bg-success/10'
  },
  intervals: { 
    icon: Zap, 
    color: 'text-warning',
    bgColor: 'bg-warning/10'
  },
  tempo: { 
    icon: TrendingUp, 
    color: 'text-accent',
    bgColor: 'bg-accent/10'
  },
  long: { 
    icon: Route, 
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  rest: { 
    icon: Moon, 
    color: 'text-muted-foreground',
    bgColor: 'bg-muted'
  },
};

export function RunningDayCard({ session, onClick }: RunningDayCardProps) {
  const config = typeConfig[session.type];
  const Icon = config.icon;
  const isRest = session.type === 'rest';

  return (
    <Card 
      className={cn(
        "p-3 cursor-pointer card-hover transition-all",
        session.isCompleted && "border-success/30 bg-success/5"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Date */}
        <div className="text-center w-12">
          <span className="text-xs text-muted-foreground uppercase block">
            {format(new Date(session.date), 'EEE', { locale: es })}
          </span>
          <span className="text-lg font-bold">
            {format(new Date(session.date), 'd')}
          </span>
        </div>

        {/* Icon */}
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          config.bgColor
        )}>
          <Icon className={cn("h-5 w-5", config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{session.name}</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!isRest && session.targetDistance && (
              <span>{session.targetDistance} km</span>
            )}
            {!isRest && session.targetDuration && (
              <span>{session.targetDuration} min</span>
            )}
            {session.targetZone && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {session.targetZone}
              </Badge>
            )}
            {isRest && <span>Descanso</span>}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1">
          {session.isCompleted ? (
            <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="h-4 w-4 text-success" />
            </div>
          ) : isRest ? (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
              <Minus className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
    </Card>
  );
}
