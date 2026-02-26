'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CalendarItem } from '@/data/client-schedule'
import {
  Target,
  Activity,
  MessageSquare,
  Save,
  Check,
  Clock,
  Route as RouteIcon,
  Dumbbell
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CardioSessionDetailProps {
  item: CalendarItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (itemId: string, data: {
    actualDistanceKm?: number
    actualDurationMin?: number
    actualAvgPace?: string
    rpe?: number
    feedbackNotes?: string
  }) => Promise<void>
}

export function CardioSessionDetail({
  item,
  open,
  onOpenChange,
  onSave
}: CardioSessionDetailProps) {
  // Pre-load values
  const [distance, setDistance] = useState(item?.actualDistanceKm?.toString() ?? '')
  const [duration, setDuration] = useState(item?.actualDurationMin?.toString() ?? '')
  const [pace, setPace] = useState(item?.actualAvgPace ?? '')
  const [rpe, setRpe] = useState<number | null>(item?.rpe ?? null)
  const [notes, setNotes] = useState(item?.feedbackNotes ?? '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Effect to auto-calculate pace when distance or duration changes
  // Logic: Duration (min) / Distance (km) = Pace (min/km)
  // Format: m:ss
  useEffect(() => {
    if (distance && duration && !pace) {
      const d = parseFloat(distance)
      const t = parseInt(duration)
      if (d > 0 && t > 0) {
        const paceDec = t / d
        const pMin = Math.floor(paceDec)
        const pSec = Math.round((paceDec - pMin) * 60)
        const pSecStr = pSec < 10 ? `0${pSec}` : `${pSec}`
        setPace(`${pMin}:${pSecStr}`)
      }
    }
  }, [distance, duration])

  // Reset form when item changes
  useEffect(() => {
    if (item && open) {
      setDistance(item.actualDistanceKm?.toString() ?? '')
      setDuration(item.actualDurationMin?.toString() ?? '')
      setPace(item.actualAvgPace ?? '')
      setRpe(item.rpe ?? null)
      setNotes(item.feedbackNotes ?? '')
    }
  }, [item, open])

  if (!item) return null

  const isRest = item.kind === 'rest'
  const isStrength = item.kind === 'strength'

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      await onSave(item.id, {
        actualDistanceKm: distance ? parseFloat(distance) : undefined,
        actualDurationMin: duration ? parseInt(duration) : undefined,
        actualAvgPace: pace || undefined,
        rpe: rpe ?? undefined,
        feedbackNotes: notes || undefined,
      })
      setSaveStatus('saved')
      setTimeout(() => {
        setSaveStatus('idle')
        onOpenChange(false)
      }, 1000)
    } catch {
      setSaveStatus('idle')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Prescribed training (read-only) */}
          <Card className="p-4 space-y-4 bg-muted/30">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              {isStrength ? (
                <Dumbbell className="h-4 w-4 text-warning" />
              ) : (
                <Target className="h-4 w-4 text-primary" />
              )}
              {isStrength ? 'Entrenamiento de fuerza' : 'Entrenamiento prescrito'}
            </h3>

            {/* Goals (cardio only) */}
            {item.kind === 'cardio' && (
              <div className="flex flex-wrap gap-2">
                {item.targetDistanceKm && (
                  <Badge variant="secondary" className="gap-1">
                    <RouteIcon className="h-3 w-3" />
                    {item.targetDistanceKm} km
                  </Badge>
                )}
                {item.targetDurationMin && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {item.targetDurationMin} min
                  </Badge>
                )}
                {item.targetPace && (
                  <Badge variant="secondary">
                    {item.targetPace}
                  </Badge>
                )}
              </div>
            )}

            {/* Strength info */}
            {isStrength && item.subtitle && (
              <p className="text-sm text-muted-foreground">
                Programa: {item.programName || item.subtitle}
              </p>
            )}

            {/* Description (cardio) */}
            {item.description && (
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            )}

            {/* Structure (from planned_structure jsonb) */}
            {item.plannedStructure ? (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">
                  Estructura
                </h4>
                <div className="space-y-1.5">
                  {renderStructure(item.plannedStructure)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic py-2">
                No hay detalles estructurados.
              </p>
            )}

            {/* Coach notes */}
            {item.coachNotes && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Notas del entrenador
                </h4>
                <p className="text-sm text-muted-foreground bg-background/50 p-2 rounded">
                  {item.coachNotes}
                </p>
              </div>
            )}
          </Card>

          {/* Client log (editable) - only for cardio sessions */}
          {item.kind === 'cardio' && !isRest && (
            <Card className="p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-success" />
                Tu registro
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Distancia (km)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="8.5"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tiempo (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="999"
                    placeholder="45"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Ritmo medio (min/km)</Label>
                <Input
                  placeholder="5:30"
                  value={pace}
                  onChange={(e) => setPace(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">RPE (1-10)</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                    <Button
                      key={value}
                      variant={rpe === value ? 'default' : 'outline'}
                      size="sm"
                      className={cn(
                        "h-10 p-0",
                        rpe === value && value <= 4 && "bg-success hover:bg-success/90",
                        rpe === value && value >= 5 && value <= 7 && "bg-warning hover:bg-warning/90",
                        rpe === value && value >= 8 && "bg-destructive hover:bg-destructive/90"
                      )}
                      onClick={() => setRpe(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  placeholder="¿Cómo te has sentido?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[60px] resize-none"
                />
              </div>

              <Button
                onClick={handleSave}
                className="w-full"
                size="lg"
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? (
                  <>Guardando...</>
                ) : saveStatus === 'saved' ? (
                  <><Check className="h-4 w-4 mr-2" /> Guardado</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Guardar sesión</>
                )}
              </Button>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Render the planned_structure JSONB — supports both array of blocks and object formats
function renderStructure(structure: any) {
  // Array of blocks: [{ name, description }, ...]
  if (Array.isArray(structure)) {
    return structure.map((block: any, idx: number) => (
      <div
        key={block.id || idx}
        className="flex items-start gap-2 text-sm bg-background/50 p-2 rounded"
      >
        <span className="text-primary">•</span>
        <div>
          {block.name && <span className="font-medium">{block.name}: </span>}
          <span className="text-muted-foreground">
            {block.description || block.duration || block.distance || ''}
          </span>
        </div>
      </div>
    ))
  }

  // Object with blocks array: { blocks: [...] }
  if (structure?.blocks && Array.isArray(structure.blocks)) {
    return renderStructure(structure.blocks)
  }

  // Simple text description
  if (typeof structure === 'string') {
    return (
      <p className="text-sm text-muted-foreground bg-background/50 p-2 rounded">
        {structure}
      </p>
    )
  }

  return null
}
