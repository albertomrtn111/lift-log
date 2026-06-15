'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
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
import { formatNumberForInput, roundToDecimals } from '@/lib/format/number'
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
  const [distance, setDistance] = useState(formatNumberForInput(item?.actualDistanceKm))
  const [duration, setDuration] = useState(formatNumberForInput(item?.actualDurationMin))
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
      const t = parseFloat(duration)
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
      setDistance(formatNumberForInput(item.actualDistanceKm))
      setDuration(formatNumberForInput(item.actualDurationMin))
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
  const hasStructuredPlan = hasStructuredCardioPlan(item.plannedStructure)

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      await onSave(item.id, {
        actualDistanceKm: distance ? roundToDecimals(distance) : undefined,
        actualDurationMin: duration ? roundToDecimals(duration) : undefined,
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
      <SheetContent className="flex h-dvh w-full flex-col overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b px-5 pb-4 pl-5 pr-16 pt-[calc(env(safe-area-inset-top,0px)+1rem)] text-left">
          <SheetTitle className="truncate text-xl">{item.title}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 pb-28 sm:px-6">
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
              {item.description && !hasStructuredPlan && (
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {item.description}
                </p>
              )}

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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Distancia (km)</Label>
                  <Input
                    className="min-w-0"
                    type="number"
                    step="0.01"
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
                    className="min-w-0"
                    type="number"
                    step="0.01"
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </Card>
          )}
        </div>
        {item.kind === 'cardio' && !isRest && (
          <SheetFooter className="shrink-0 border-t bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3 backdrop-blur sm:px-6">
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-11 flex-1"
                disabled={saveStatus === 'saving'}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className="h-11 flex-1"
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
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

function hasStructuredCardioBlocks(structure: any) {
  const blocks = Array.isArray(structure) ? structure : structure?.blocks
  return Array.isArray(blocks) && blocks.some((block: any) =>
    ['warmup', 'continuous', 'intervals', 'cooldown'].includes(block?.type)
  )
}

function hasStructuredCardioPlan(structure: any) {
  if (hasStructuredCardioBlocks(structure)) return true
  return structure?.mode === 'structured'
    && typeof structure?.description === 'string'
    && structure.description.trim().length > 0
}

function formatDistance(km?: number, { preferMeters = false } = {}) {
  const value = Number(km)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value < 1) return `${Math.round(value * 1000)} m`
  if (preferMeters && value <= 5) return `${Math.round(value * 1000)} m`
  if (value <= 5) return `${Number.isInteger(value) ? value : value.toFixed(1)} km`
  return `${Number.isInteger(value) ? value : value.toFixed(1)} km`
}

function formatDuration(minutes?: number) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return null
  return Number.isInteger(value) ? `${value}'` : `${value.toFixed(1)} min`
}

function joinClean(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function normalizeBlockLabel(block: any) {
  const raw = `${block?.label || block?.name || ''}`.trim()
  const lower = raw.toLowerCase()
  if (lower === 'bloque principal') return 'Principal'
  if (lower === 'vuelta a la calma' || lower === 'vuelta calma') return 'Enfriamiento'
  if (raw) return raw
  if (block?.type === 'warmup') return 'Calentamiento'
  if (block?.type === 'cooldown') return 'Enfriamiento'
  if (block?.type === 'intervals') return 'Principal'
  if (block?.type === 'continuous') return 'Continuo'
  return 'Bloque'
}

function describeStructuredBlock(block: any) {
  if (block?.type === 'intervals') {
    const sets = Number(block.sets)
    const effort = formatDistance(block.workDistance, { preferMeters: true }) || formatDuration(block.workDuration)
    const work = Number.isFinite(sets) && sets > 0 && effort ? `${sets} x ${effort}` : effort
    const target = block.workTargetPace || block.workIntensity || block.workTargetHR
    const rest = formatDistance(block.restDistance, { preferMeters: true }) || formatDuration(block.restDuration)
    return joinClean([
      work,
      target ? `@ ${target}` : null,
      rest ? `rec ${rest}` : null,
    ])
  }

  return joinClean([
    formatDistance(block?.distance),
    formatDuration(block?.duration),
    block?.targetPace || block?.intensity,
    block?.targetHR,
  ])
}

function renderStructuredBlocks(blocks: any[]) {
  const rows = blocks
    .map((block, idx) => ({
      id: block?.id || idx,
      label: normalizeBlockLabel(block),
      detail: describeStructuredBlock(block),
    }))
    .filter((row) => row.label || row.detail)

  if (rows.length === 0) return null

  return (
    <div className="space-y-2 pt-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Estructura
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex min-w-0 items-start gap-2 text-sm leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
            <p className="min-w-0 break-words">
              <span className="font-semibold">{row.label}: </span>
              <span>{row.detail || 'Sin detalles'}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function renderStructuredSummary(description: string) {
  const parts = description
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return null

  const rows = parts.map((detail, idx) => {
    const isFirst = idx === 0
    const isLast = idx === parts.length - 1
    const label = isFirst
      ? 'Calentamiento'
      : isLast
        ? 'Enfriamiento'
        : parts.length > 3
          ? `Principal ${idx}`
          : 'Principal'

    return { id: `${idx}-${detail}`, label, detail }
  })

  return renderStructuredBlocks(rows.map((row) => ({
    id: row.id,
    label: row.label,
    type: 'summary',
    targetPace: row.detail,
  })))
}

// Render the planned_structure JSONB — supports both structured and legacy formats.
function renderStructure(structure: any): any {
  const blocks = Array.isArray(structure) ? structure : structure?.blocks
  if (Array.isArray(blocks) && blocks.length > 0) {
    if (hasStructuredCardioBlocks(blocks)) {
      return renderStructuredBlocks(blocks)
    }

    return blocks.map((block: any, idx: number) => {
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

  if (structure?.mode === 'structured' && typeof structure.description === 'string') {
    return renderStructuredSummary(structure.description)
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
