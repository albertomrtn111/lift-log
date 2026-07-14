'use client'

import { useEffect, useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Cake,
    Gauge,
    HeartPulse,
    Loader2,
    Pencil,
    Ruler,
    Scale,
    User,
    X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AthleteThresholdsCard } from './AthleteThresholdsCard'
import {
    getAthleteBaselineAction,
    saveAthleteBaselineAction,
    type AthleteBaseline,
    type AthleteBaselineWithCurrent,
    type AthleteSex,
} from './athlete-baseline-actions'

/**
 * Configuración del atleta en bloques modulares:
 *  - Datos base (siempre): edad, sexo, altura, peso de referencia, VO2máx.
 *  - Resistencia (opcional): umbrales y zonas — desactivable para atletas de
 *    solo fuerza / culturismo / powerlifting.
 */

interface AthleteConfigSectionProps {
    clientId: string
}

interface FormState {
    birth_date: string
    sex: AthleteSex | ''
    height_cm: string
    reference_weight_kg: string
    reference_weight_date: string
    vo2max: string
}

const EMPTY_FORM: FormState = {
    birth_date: '',
    sex: '',
    height_cm: '',
    reference_weight_kg: '',
    reference_weight_date: '',
    vo2max: '',
}

const SEX_LABELS: Record<AthleteSex, string> = {
    male: 'Hombre',
    female: 'Mujer',
    other: 'Otro',
}

function toForm(b: AthleteBaseline | null): FormState {
    if (!b) return EMPTY_FORM
    return {
        birth_date: b.birth_date ?? '',
        sex: b.sex ?? '',
        height_cm: b.height_cm?.toString() ?? '',
        reference_weight_kg: b.reference_weight_kg?.toString() ?? '',
        reference_weight_date: b.reference_weight_date ?? '',
        vo2max: b.vo2max?.toString() ?? '',
    }
}

function parseNumOrNull(value: string): number | null {
    const n = Number(value.replace(',', '.'))
    return value.trim() !== '' && Number.isFinite(n) ? n : null
}

function computeAge(birthDate: string | null): number | null {
    if (!birthDate) return null
    const birth = new Date(`${birthDate}T12:00:00`)
    if (isNaN(birth.getTime())) return null
    return Math.floor((Date.now() - birth.getTime()) / (365.25 * 86400000))
}

function formatShortDate(iso: string): string {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AthleteConfigSection({ clientId }: AthleteConfigSectionProps) {
    const [data, setData] = useState<AthleteBaselineWithCurrent | null>(null)
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [isSaving, startSaving] = useTransition()

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        getAthleteBaselineAction(clientId).then(result => {
            if (cancelled) return
            setData(result)
            setForm(toForm(result.baseline))
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [clientId])

    const baseline = data?.baseline ?? null
    const enduranceEnabled = baseline?.endurance_enabled ?? true

    const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value }))

    const persist = (input: Parameters<typeof saveAthleteBaselineAction>[1], onDone?: () => void) => {
        startSaving(async () => {
            const result = await saveAthleteBaselineAction(clientId, input)
            if (result.success && result.baseline) {
                setData(prev => prev
                    ? { ...prev, baseline: result.baseline! }
                    : { baseline: result.baseline!, currentWeightKg: null, currentWeightDate: null })
                setForm(toForm(result.baseline))
                onDone?.()
                toast.success('Datos del atleta guardados.')
            } else {
                toast.error(result.error || 'No se pudieron guardar los datos.')
            }
        })
    }

    const buildInput = (enduranceOverride?: boolean) => ({
        birth_date: form.birth_date || null,
        sex: (form.sex || null) as AthleteSex | null,
        height_cm: parseNumOrNull(form.height_cm),
        reference_weight_kg: parseNumOrNull(form.reference_weight_kg),
        reference_weight_date: form.reference_weight_date || null,
        vo2max: parseNumOrNull(form.vo2max),
        endurance_enabled: enduranceOverride ?? enduranceEnabled,
    })

    const handleSave = () => persist(buildInput(), () => setEditing(false))
    const handleToggleEndurance = (enabled: boolean) => persist(buildInput(enabled))

    const age = computeAge(baseline?.birth_date ?? null)
    const weightDelta = baseline?.reference_weight_kg != null && data?.currentWeightKg != null
        ? Math.round((data.currentWeightKg - baseline.reference_weight_kg) * 10) / 10
        : null
    const bmi = baseline?.height_cm && data?.currentWeightKg
        ? Math.round((data.currentWeightKg / Math.pow(baseline.height_cm / 100, 2)) * 10) / 10
        : null

    const hasAnyData = !!baseline && (
        baseline.birth_date || baseline.sex || baseline.height_cm ||
        baseline.reference_weight_kg || baseline.vo2max
    )

    return (
        <div className="space-y-6">
            {/* ============ Bloque: datos base del atleta ============ */}
            <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold">Datos del atleta</h3>
                            <p className="text-xs text-muted-foreground">
                                Referencias base: edad, antropometría y condición.
                            </p>
                        </div>
                    </div>
                    {!editing ? (
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={loading}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            {hasAnyData ? 'Editar' : 'Configurar'}
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setForm(toForm(baseline)) }} disabled={isSaving}>
                            <X className="mr-1 h-3.5 w-3.5" />
                            Cancelar
                        </Button>
                    )}
                </div>

                <div className="p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : editing ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                    <Label htmlFor="bl-birth" className="text-xs">Fecha de nacimiento</Label>
                                    <Input id="bl-birth" type="date" value={form.birth_date} onChange={set('birth_date')} className="mt-1.5" />
                                </div>
                                <div>
                                    <Label className="text-xs">Sexo</Label>
                                    <Select
                                        value={form.sex || 'none'}
                                        onValueChange={(v) => setForm(prev => ({ ...prev, sex: v === 'none' ? '' : v as AthleteSex }))}
                                    >
                                        <SelectTrigger className="mt-1.5">
                                            <SelectValue placeholder="—" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin especificar</SelectItem>
                                            <SelectItem value="male">Hombre</SelectItem>
                                            <SelectItem value="female">Mujer</SelectItem>
                                            <SelectItem value="other">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="bl-height" className="text-xs">Altura (cm)</Label>
                                    <Input id="bl-height" type="number" inputMode="decimal" placeholder="178" value={form.height_cm} onChange={set('height_cm')} className="mt-1.5" />
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                    <Label htmlFor="bl-weight" className="text-xs">Peso de referencia (kg)</Label>
                                    <Input id="bl-weight" type="number" inputMode="decimal" step="0.1" placeholder="82.5" value={form.reference_weight_kg} onChange={set('reference_weight_kg')} className="mt-1.5" />
                                    <p className="mt-1 text-[10px] text-muted-foreground">Peso inicial o de partida del proceso.</p>
                                </div>
                                <div>
                                    <Label htmlFor="bl-weight-date" className="text-xs">Fecha de esa referencia</Label>
                                    <Input id="bl-weight-date" type="date" value={form.reference_weight_date} onChange={set('reference_weight_date')} className="mt-1.5" />
                                </div>
                                <div>
                                    <Label htmlFor="bl-vo2" className="text-xs">VO2máx (ml/kg/min)</Label>
                                    <Input id="bl-vo2" type="number" inputMode="decimal" step="0.1" placeholder="52" value={form.vo2max} onChange={set('vo2max')} className="mt-1.5" />
                                    <p className="mt-1 text-[10px] text-muted-foreground">De prueba de esfuerzo o estimación del reloj.</p>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Guardar datos
                                </Button>
                            </div>
                        </div>
                    ) : !hasAnyData ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            Sin datos base configurados. Añade edad, altura y peso de referencia para
                            contextualizar el progreso del atleta.
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                            <BaselineStat
                                icon={<Cake className="h-3.5 w-3.5" />}
                                label="Edad"
                                value={age !== null ? `${age} años` : '—'}
                                hint={baseline?.sex ? SEX_LABELS[baseline.sex] : undefined}
                            />
                            <BaselineStat
                                icon={<Ruler className="h-3.5 w-3.5" />}
                                label="Altura"
                                value={baseline?.height_cm ? `${baseline.height_cm} cm` : '—'}
                                hint={bmi ? `IMC ${bmi}` : undefined}
                            />
                            <BaselineStat
                                icon={<Scale className="h-3.5 w-3.5" />}
                                label="Peso referencia"
                                value={baseline?.reference_weight_kg ? `${baseline.reference_weight_kg} kg` : '—'}
                                hint={baseline?.reference_weight_date ? formatShortDate(baseline.reference_weight_date) : undefined}
                            />
                            <BaselineStat
                                icon={<Scale className="h-3.5 w-3.5" />}
                                label="Peso actual"
                                value={data?.currentWeightKg ? `${data.currentWeightKg} kg` : '—'}
                                hint={weightDelta !== null
                                    ? `${weightDelta > 0 ? '+' : ''}${weightDelta} kg vs referencia`
                                    : data?.currentWeightDate ? formatShortDate(data.currentWeightDate) : undefined}
                                hintClass={weightDelta !== null
                                    ? weightDelta < 0 ? 'text-emerald-600' : weightDelta > 0 ? 'text-amber-600' : undefined
                                    : undefined}
                            />
                            <BaselineStat
                                icon={<Gauge className="h-3.5 w-3.5" />}
                                label="VO2máx"
                                value={baseline?.vo2max ? `${baseline.vo2max}` : '—'}
                                hint={baseline?.vo2max ? 'ml/kg/min' : undefined}
                            />
                        </div>
                    )}
                </div>

                {/* Modularidad: activar/desactivar el bloque de resistencia */}
                <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <HeartPulse className="h-4 w-4 text-rose-500" />
                        <div>
                            <p className="text-sm font-medium">Bloque de resistencia</p>
                            <p className="text-[11px] text-muted-foreground">
                                Umbrales de FC, ritmo y zonas. Desactívalo para atletas de solo fuerza,
                                culturismo o powerlifting.
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={enduranceEnabled}
                        onCheckedChange={handleToggleEndurance}
                        disabled={loading || isSaving}
                    />
                </div>
            </Card>

            {/* ============ Bloque: resistencia (opcional) ============ */}
            {!loading && enduranceEnabled && (
                <AthleteThresholdsCard clientId={clientId} />
            )}
        </div>
    )
}

function BaselineStat({
    icon,
    label,
    value,
    hint,
    hintClass,
}: {
    icon: React.ReactNode
    label: string
    value: string
    hint?: string
    hintClass?: string
}) {
    return (
        <div className="rounded-xl border bg-muted/20 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="text-muted-foreground/70">{icon}</span>
                {label}
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
            {hint && (
                <p className={cn('mt-0.5 text-[11px] text-muted-foreground', hintClass)}>{hint}</p>
            )}
        </div>
    )
}
