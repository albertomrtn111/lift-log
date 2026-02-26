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
  Dumbbell
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

// Map training types to more specific icons
function getCardioIcon(trainingType?: string) {
  switch (trainingType?.toLowerCase()) {
    case 'series':
    case 'intervals':
    case 'hiit':
      return { icon: Zap, color: 'text-warning', bgColor: 'bg-warning/10' }
    case 'tempo':
    case 'umbral':
      return { icon: TrendingUp, color: 'text-accent', bgColor: 'bg-accent/10' }
    case 'tirada_larga':
    case 'long':
      return { icon: Route, color: 'text-primary', bgColor: 'bg-primary/10' }
    default:
      return { icon: Footprints, color: 'text-success', bgColor: 'bg-success/10' }
  }
}

export function PlanningDayCard({ item, onClick }: PlanningDayCardProps) {
  const config = item.kind === 'cardio'
    ? getCardioIcon(item.trainingType)
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
