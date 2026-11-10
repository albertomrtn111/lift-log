'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StudioVbtEquation } from '@/data/studio'
import {
    VELOCITY_TYPE_LABELS,
    VELOCITY_TYPE_NAMES,
    formatKg,
    formatVelocity,
    kmhFromMs,
    loadVelocityProfile,
    msFromKmh,
    profilePoints,
    repsToFailure,
    rirEstimate,
    vbtEstimate,
} from '@/lib/studio/vbt-rules'
import { parseNumber } from '@/lib/studio/editor-rules'

const twoDecimals = (value: number) => value.toFixed(2).replace('.', ',')

/** Velocidad de la celda: con ecuación, %RM y RM estimado; sin ella, conversor a km/h. */
export function StudioVelocity({ equation, value, onChange, loadKg, reps }: {
    equation: StudioVbtEquation | null
    value: string
    onChange: (value: string) => void
    loadKg: string
    reps: string
}) {
    const label = equation ? VELOCITY_TYPE_LABELS[equation.velocity_type] : null
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="sala-velocity" className="text-xs">
                        Velocidad{label ? ` ${label}` : ''} (m/s)
                    </Label>
                    <Input
                        id="sala-velocity"
                        value={value}
                        autoComplete="off"
                        inputMode="decimal"
                        placeholder="0,00"
                        onChange={event => onChange(event.target.value)}
                    />
                </div>
                {equation
                    ? <VbtReadout equation={equation} loadKg={loadKg} velocity={value} reps={reps} />
                    : <KmhField value={value} onChange={onChange} />}
            </div>
            {equation && (
                <p className="text-xs text-muted-foreground">
                    {`Ecuación con ${VELOCITY_TYPE_NAMES[equation.velocity_type]}: ${equation.source}. Repeticiones al fallo orientativas (Brzycki).`}
                </p>
            )}
        </div>
    )
}

function VbtReadout({ equation, loadKg, velocity, reps }: {
    equation: StudioVbtEquation
    loadKg: string
    velocity: string
    reps: string
}) {
    const estimate = vbtEstimate(equation, loadKg, velocity)
    if (!estimate || estimate.pct === null || estimate.rm === null) {
        return (
            <p className="col-span-2 self-end pb-1 text-xs text-muted-foreground">
                {estimate
                    ? 'La velocidad está fuera del rango de la ecuación de este ejercicio.'
                    : `Con la carga y la ${VELOCITY_TYPE_LABELS[equation.velocity_type]} sale el % RM y el RM estimado de hoy.`}
            </p>
        )
    }
    const toFailure = repsToFailure(estimate.pct)
    const rir = rirEstimate(estimate.pct, reps)
    return (
        <div className="col-span-2 grid grid-cols-3 gap-1 self-end rounded-md bg-muted/60 p-1.5 text-center" aria-live="polite">
            <Kpi value={`${estimate.pct} %`} label="del RM" />
            <Kpi
                value={estimate.pct < 60 ? '15+' : `≈ ${toFailure}`}
                label={`rep. al fallo${rir !== null ? ` · RIR ≈ ${rir}` : ''}`}
            />
            <Kpi value={`${formatKg(estimate.rm)} kg`} label="RM estimado" />
        </div>
    )
}

function Kpi({ value, label }: { value: string; label: string }) {
    return (
        <div className="min-w-0">
            <div className="text-sm font-semibold tabular-nums">{value}</div>
            <div className="text-[0.65rem] leading-tight text-muted-foreground">{label}</div>
        </div>
    )
}

/** km/h ⇄ m/s para cintas y sprints (km/h = m/s × 3,6). */
function KmhField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const [typed, setTyped] = useState<string | null>(null)
    const ms = parseNumber(value)
    const shown = typed ?? (ms !== null && !Number.isNaN(ms) && ms > 0 ? twoDecimals(kmhFromMs(ms)) : '')
    return (
        <div className="min-w-0 space-y-1.5">
            <Label htmlFor="sala-kmh" className="text-xs">En km/h</Label>
            <Input
                id="sala-kmh"
                value={shown}
                autoComplete="off"
                inputMode="decimal"
                placeholder="0,00"
                onChange={event => {
                    setTyped(event.target.value)
                    const kmh = parseNumber(event.target.value)
                    onChange(kmh !== null && !Number.isNaN(kmh) && kmh > 0 ? twoDecimals(msFromKmh(kmh)) : '')
                }}
                onBlur={() => setTyped(null)}
            />
        </div>
    )
}

/** Perfil carga-velocidad de hoy con la mejor velocidad de cada carga de las series. */
export function StudioDayProfile({ equation, rows }: {
    equation: StudioVbtEquation | null
    rows: { loadKg: string; velocityMs: string }[]
}) {
    const profile = loadVelocityProfile(equation, profilePoints(rows))
    if (!profile) return null

    const width = 300
    const height = 150
    const pad = 28
    const loads = profile.points.map(point => point[1]).concat(profile.rm ? [profile.rm] : [])
    const speeds = profile.points.map(point => point[0]).concat(profile.rm && profile.mvt ? [profile.mvt] : [])
    const velocityAt = (load: number) => (load - profile.c) / profile.m
    const fromLoad = Math.max(0, Math.min(...loads) * 0.8)
    const toLoad = Math.max(...loads) * 1.04
    const maxLoad = Math.max(...loads) * 1.1
    const maxSpeed = Math.max(velocityAt(fromLoad), ...speeds) * 1.12
    const x = (load: number) => pad + ((load - fromLoad) / (maxLoad - fromLoad)) * (width - pad - 8)
    const y = (speed: number) => height - 18 - (speed / maxSpeed) * (height - 28)

    return (
        <div className="space-y-2 rounded-md border p-3">
            <span className="text-sm font-medium">Perfil carga-velocidad de hoy · {profile.n} cargas</span>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-foreground" role="img" aria-label="Perfil carga-velocidad de hoy">
                <line x1={pad} y1={height - 18} x2={width - 4} y2={height - 18} className="stroke-border" />
                <line x1={pad} y1={6} x2={pad} y2={height - 18} className="stroke-border" />
                <text x={width - 6} y={height - 4} textAnchor="end" fontSize="9" className="fill-muted-foreground">kg</text>
                <text x={pad - 4} y={12} textAnchor="end" fontSize="9" className="fill-muted-foreground">m/s</text>
                <line
                    x1={x(fromLoad)}
                    y1={y(velocityAt(fromLoad))}
                    x2={x(toLoad)}
                    y2={y(velocityAt(toLoad))}
                    strokeWidth={2}
                    strokeDasharray={profile.rm ? undefined : '4 3'}
                    className="stroke-primary"
                />
                {profile.points.map(([speed, load]) => (
                    <g key={load}>
                        <circle cx={x(load)} cy={y(speed)} r={4.5} className="fill-primary" />
                        <text x={x(load) - 8} y={y(speed) + 3} textAnchor="end" fontSize="9" className="fill-foreground">
                            {`${formatKg(load)} kg · ${formatVelocity(speed)}`}
                        </text>
                    </g>
                ))}
                {profile.rm && profile.mvt && (
                    <g>
                        <circle cx={x(profile.rm)} cy={y(profile.mvt)} r={5} className="fill-background stroke-primary" strokeWidth={2} />
                        <text x={x(profile.rm) - 9} y={y(profile.mvt) + 3} textAnchor="end" fontSize="9" fontWeight={700} className="fill-foreground">
                            {`RM ${formatKg(profile.rm)} kg`}
                        </text>
                    </g>
                )}
            </svg>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {profile.rm && profile.mvt && <Kpi value={`${formatKg(profile.rm)} kg`} label={`RM a ${formatVelocity(profile.mvt)} m/s`} />}
                <Kpi value={`${formatKg(profile.l0)} kg`} label="L0 · carga a velocidad 0" />
                <Kpi value={`${twoDecimals(profile.v0)} m/s`} label="V0 · sin carga" />
                {profile.r2 !== null && <Kpi value={twoDecimals(profile.r2)} label="R² del ajuste" />}
            </div>
            <p className="text-xs text-muted-foreground">
                {`Recta con la mejor velocidad de cada carga de hoy${profile.n === 2 ? ' (con dos cargas: cuanto más separadas, más fiable)' : ''}.`}
                {profile.rm
                    ? ' El RM se calcula a la velocidad de RM del ejercicio.'
                    : equation
                        ? ' Con estas cargas el RM no sale creíble.'
                        : ' Este ejercicio no tiene ecuación con velocidad de RM, así que no se estima el RM.'}
            </p>
        </div>
    )
}
