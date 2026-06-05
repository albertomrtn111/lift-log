import { CalendarItem, CalendarItemKind } from '@/data/client-schedule'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Footprints,
  Zap,
  TrendingUp,
  Route,
  Moon,
  Check,
  ChevronRight,
  Minus,
  Dumbbell,
  Gauge,
  Shuffle,
  Bike,
  Waves
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveCardioDisplayKind } from '@/lib/cardio/display-kind'

interface PlanningDayCardProps {
  item: CalendarItem
  onClick: () => void
}

const kindConfig: Record<CalendarItemKind, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}> = {
  cardio: {
    icon: Footprints,
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  strength: {
    icon: Dumbbell,
    color: 'text-warning',
    bgColor: 'bg-warning/10'
  },
  rest: {
    icon: Moon,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted'
  },
}

// Map cardio discipline/training types to more specific icons.
function getCardioIcon(activityType?: string, trainingType?: string) {
  switch (resolveCardioDisplayKind(activityType, trainingType)) {
    case 'series':
      return { icon: Zap, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
    case 'tempo':
      return { icon: Gauge, color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
    case 'hybrid':
      return { icon: Dumbbell, color: 'text-purple-500', bgColor: 'bg-purple-500/10' }
    case 'progressive':
      return { icon: TrendingUp, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' }
    case 'fartlek':
      return { icon: Shuffle, color: 'text-pink-500', bgColor: 'bg-pink-500/10' }
    case 'bike':
      return { icon: Bike, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' }
    case 'swim':
      return { icon: Waves, color: 'text-teal-500', bgColor: 'bg-teal-500/10' }
    case 'running':
    default:
      return { icon: Footprints, color: 'text-green-500', bgColor: 'bg-green-500/10' }
  }
}

export function PlanningDayCard({ item, onClick }: PlanningDayCardProps) {
  const config = item.kind === 'cardio'
    ? getCardioIcon(item.activityType, item.trainingType)
    : kindConfig[item.kind]
  const Icon = config.icon
  const isRest = item.kind === 'rest'

  return (
    <Card
      className={cn(
        "p-3 cursor-pointer card-hover transition-all",
        item.isCompleted && "border-success/30 bg-success/5"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Date */}
        <div className="text-center w-12">
          <span className="text-xs text-muted-foreground uppercase block">
            {format(new Date(item.date + 'T12:00:00'), 'EEE', { locale: es })}
          </span>
          <span className="text-lg font-bold">
            {format(new Date(item.date + 'T12:00:00'), 'd')}
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
          <h4 className="font-medium text-sm truncate">{item.title}</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!isRest && item.subtitle && (
              <span className="truncate">{item.subtitle}</span>
            )}
            {isRest && <span>Descanso</span>}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1">
          {item.isCompleted ? (
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
  )
}
