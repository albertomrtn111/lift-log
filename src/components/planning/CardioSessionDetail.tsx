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
  Activity,
  MessageSquare,
  Save,
  Check,
  Clock,
  Route as RouteIcon,
  Dumbbell,
  Heart
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
    avgHeartRate?: number
    maxHeartRate?: number
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
  const [avgHR, setAvgHR] = useState(item?.avgHeartRate?.toString() ?? '')
  const [maxHR, setMaxHR] = useState(item?.maxHeartRate?.toString() ?? '')
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
      setAvgHR(item.avgHeartRate?.toString() ?? '')
      setMaxHR(item.maxHeartRate?.toString() ?? '')
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
        avgHeartRate: avgHR ? parseInt(avgHR) : undefined,
        maxHeartRate: maxHR ? parseInt(maxHR) : undefined,
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
          {/* ── Prescribed Training (read-only) ── */}
          <Card className="overflow-hidden border-0 shadow-sm bg-muted/20">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              {isStrength ? (
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <Dumbbell className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
              <h3 className="font-semibold text-sm">
                {isStrength ? 'Entrenamiento de fuerza' : 'Entrenamiento prescrito'}
              </h3>
            </div>

            {/* Target chips (cardio only, conditional) */}
            {item.kind === 'cardio' && (item.targetDistanceKm || item.targetDurationMin || item.targetPace) && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                {item.targetDistanceKm && (
                  <Badge variant="secondary" className="gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                    <RouteIcon className="h-3 w-3" />
                    {item.targetDistanceKm} km
                  </Badge>
                )}
                {item.targetDurationMin && (
                  <Badge variant="secondary" className="gap-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0">
                    <Clock className="h-3 w-3" />
                    {item.targetDurationMin} min
                  </Badge>
                )}
                {item.targetPace && (
                  <Badge variant="secondary" className="gap-1 text-xs font-medium bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0">
                    {item.targetPace} /km
                  </Badge>
                )}
              </div>
            )}

            {/* Strength info */}
            {isStrength && item.subtitle && (
              <p className="text-sm text-muted-foreground px-4 pb-2">
                Programa: {item.programName || item.subtitle}
              </p>
            )}

            {/* Body: description + structure */}
            <div className="px-4 pb-4 space-y-3">
              {/* Description (main text block) */}
              {item.description && (
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {item.description}
                </p>
              )}

              {/* Structure rendered as clean bullet list — no "ESTRUCTURA" label */}
              {item.plannedStructure && (
                <div className="space-y-1.5">
                  {renderStructure(item.plannedStructure)}
                </div>
              )}
            </div>

            {/* Coach notes — visually separated block */}
            {item.coachNotes && (
              <>
                <div className="border-t border-border/40" />
                <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      Notas del entrenador
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {item.coachNotes}
                  </p>
                </div>
              </>
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

              {/* ── Heart Rate divider strip ── */}
              <div className="relative -mx-4 px-4 py-3 bg-rose-50/60 dark:bg-rose-950/20 border-y border-rose-100 dark:border-rose-900/30">
                  <div className="flex items-center gap-1.5 mb-2.5">
                      <Heart className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400 fill-rose-500 dark:fill-rose-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Pulsaciones
                      </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                          <Label className="text-xs">Media (bpm)</Label>
                          <Input
                              type="number"
                              min="40"
                              max="220"
                              step="1"
                              placeholder="145"
                              value={avgHR}
                              onChange={(e) => setAvgHR(e.target.value)}
                          />
                      </div>
                      <div className="space-y-1.5">
                          <Label className="text-xs">Máxima (bpm)</Label>
                          <Input
                              type="number"
                              min="40"
                              max="220"
                              step="1"
                              placeholder="178"
                              value={maxHR}
                              onChange={(e) => setMaxHR(e.target.value)}
                          />
                      </div>
                  </div>
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
function renderStructure(structure: any): any {
  // Array of blocks: [{ name, description }, ...]
  if (Array.isArray(structure)) {
    if (structure.length === 0) return null
    return structure.map((block: any, idx: number) => {
      const detail = block.description || block.duration || block.distance || ''
      if (!block.name && !detail) return null
      return (
        <div
          key={block.id || idx}
          className="flex items-start gap-2.5 text-sm py-1"
        >
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
          <div className="leading-relaxed">
            {block.name && <span className="font-medium">{block.name}: </span>}
            <span className="text-muted-foreground">{detail}</span>
          </div>
        </div>
      )
    })
  }

  // Object with blocks array: { blocks: [...] }
  if (structure?.blocks && Array.isArray(structure.blocks) && structure.blocks.length > 0) {
    return renderStructure(structure.blocks)
  }

  // Object with description field (simple mode from CardioSessionForm)
  if (structure?.description && typeof structure.description === 'string') {
    return (
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
        {structure.description}
      </p>
    )
  }

  // Simple text description
  if (typeof structure === 'string') {
    return (
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
        {structure}
      </p>
    )
  }

  return null
}
