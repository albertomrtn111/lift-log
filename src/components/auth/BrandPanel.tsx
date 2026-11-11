'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, ChartNoAxesColumnIncreasing, Dumbbell, MessageCircle, Salad } from 'lucide-react'
import { athleteGradient } from '@/components/coach/AthleteAvatar'
import { cn } from '@/lib/utils'

/*
 * Panel de marca de las pantallas de acceso (solo escritorio). Siempre en tinta,
 * como la web comercial. Enseña cuatro piezas de la app tal y como son tras el
 * rediseño: cómo va un atleta, su volumen semanal, la facturación del mes y la
 * app del móvil. Se dibujan a tamaño fijo (texto de 12 px o más) y se escalan
 * al hueco libre, así que nada se corta en ninguna resolución. Datos de ejemplo.
 */

type Focus = 'coach' | 'athlete'
type Layout = 'full' | 'compact' | 'phone'

const SIZE: Record<Layout, { w: number; h: number }> = {
    full: { w: 664, h: 480 },
    compact: { w: 420, h: 480 },
    phone: { w: 248, h: 480 },
}

export function BrandPanel({ title, text, focus = 'coach' }: { title?: React.ReactNode; text?: string; focus?: Focus }) {
    return (
        <aside className="hidden p-3 lg:flex lg:w-[48%] xl:w-[52%]" aria-hidden>
            <div className="nt-stage flex w-full flex-col rounded-[28px] px-10 pb-7 pt-10 xl:px-12 xl:pt-12 [@media(max-height:780px)]:pt-8">
                <div className="shrink-0">
                    <p className="nt-eyebrow nt-eyebrow-line text-white/50">
                        {focus === 'athlete' ? 'Tu app de entrenamiento' : 'Panel del entrenador y app del atleta'}
                    </p>
                    <h2 className="nt-display mt-5 max-w-[32rem] text-[2.4rem] text-white xl:text-[2.75rem] [@media(max-height:780px)]:mt-4 [@media(max-height:780px)]:text-[2.1rem]">
                        {title ?? <>Entrena a cada atleta como si fuera <span className="text-[#3D8CFF]">el único.</span></>}
                    </h2>
                    <p className="mt-4 max-w-[32rem] text-[15px] leading-relaxed text-white/60 [@media(max-height:860px)]:hidden">
                        {text ?? 'Su progreso, el volumen de cada semana y lo que has cobrado, en tu panel. Su plan y sus series, en su móvil.'}
                    </p>
                </div>

                <FitStage focus={focus}>
                    {layout => (layout === 'phone' ? <Phone /> : <Board withPhone={layout === 'full'} />)}
                </FitStage>

                <p className="nt-eyebrow shrink-0 text-[10.5px] text-white/35">NexTrain · datos de ejemplo</p>
            </div>
        </aside>
    )
}

/** Elige el dibujo según el hueco libre y lo escala para que quepa entero (sin pasar de 1,1×). */
function FitStage({ focus, children }: { focus: Focus; children: (layout: Layout) => React.ReactNode }) {
    const box = useRef<HTMLDivElement>(null)
    const [state, setState] = useState<{ layout: Layout; scale: number } | null>(null)

    useLayoutEffect(() => {
        const el = box.current
        if (!el) return
        const update = () => {
            const layout: Layout = focus === 'athlete' ? 'phone' : el.clientWidth >= 500 ? 'full' : 'compact'
            const { w, h } = SIZE[layout]
            const scale = Math.min(el.clientWidth / w, el.clientHeight / h, focus === 'athlete' ? 1.25 : 1.1)
            setState(scale > 0 ? { layout, scale } : null)
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(el)
        return () => observer.disconnect()
    }, [focus])

    const size = state ? SIZE[state.layout] : SIZE.full
    return (
        <div ref={box} className="relative my-7 min-h-0 flex-1 [@media(max-height:780px)]:my-5">
            {state && (
                <div
                    className={cn('absolute top-1/2', focus === 'athlete' ? 'left-1/2' : 'left-0')}
                    style={{
                        width: size.w,
                        height: size.h,
                        transformOrigin: focus === 'athlete' ? 'center' : 'left center',
                        transform: `${focus === 'athlete' ? 'translate(-50%, -50%)' : 'translateY(-50%)'} scale(${state.scale})`,
                    }}
                >
                    {children(state.layout)}
                </div>
            )}
        </div>
    )
}

// ------------------------------------------------------------- Piezas

/** Superficie de la app en oscuro: tarjeta con filo de luz. */
function Tile({ className, delay = 0, children }: { className?: string; delay?: number; children: React.ReactNode }) {
    return (
        <div
            className={cn('nt-rise rounded-[20px] bg-[#131826] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-white/[0.08]', className)}
            style={{ animationDelay: `${delay}ms` }}
        >
            {children}
        </div>
    )
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('nt-eyebrow text-[10.5px] text-white/50', className)}>{children}</p>
}

/** Panel del entrenador: progreso de un atleta, volumen semanal y facturación; con el móvil al lado. */
function Board({ withPhone }: { withPhone: boolean }) {
    return (
        <div className="flex h-full gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
                <AthleteProgress />
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-3.5">
                    <WeeklyVolume />
                    <Billing />
                </div>
            </div>
            {withPhone && (
                <div className="w-[248px] shrink-0">
                    <Phone />
                </div>
            )}
        </div>
    )
}

// Peso medio de las últimas 8 semanas: baja sin perder fuerza.
const WEIGHT = [73.9, 73.6, 73.7, 73.2, 73.0, 72.9, 72.6, 72.4]

function smoothPath(values: number[], width: number, height: number, pad = 6) {
    const min = Math.min(...values) - 0.2
    const max = Math.max(...values) + 0.2
    const xs = values.map((_, i) => pad + (i * (width - pad * 2)) / (values.length - 1))
    const ys = values.map(v => pad + ((max - v) / (max - min)) * (height - pad * 2))
    let d = `M ${xs[0]} ${ys[0]}`
    for (let i = 1; i < values.length; i++) {
        const cx = (xs[i - 1] + xs[i]) / 2
        d += ` C ${cx} ${ys[i - 1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`
    }
    return { d, end: { x: xs[xs.length - 1], y: ys[ys.length - 1] } }
}

function AthleteProgress() {
    const W = 200
    const H = 72
    const { d, end } = smoothPath(WEIGHT, W, H)
    return (
        <Tile className="shrink-0">
            <div className="flex items-center gap-3">
                <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white ring-1 ring-white/10"
                    style={{ backgroundImage: athleteGradient('Iván Torres') }}
                >
                    IT
                </span>
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15.5px] font-semibold leading-tight text-white">
                        Iván Torres
                        <span className="rounded-full bg-emerald-500/[0.15] px-2 py-0.5 text-[11.5px] font-semibold text-emerald-300">Activo</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-white/55">Maratón · semana 8 de 12</p>
                </div>
                <div className="shrink-0 text-right">
                    <Eyebrow>Adherencia</Eyebrow>
                    <p className="mt-1 text-white">
                        <span className="nt-number text-[20px] leading-none">92</span>
                        <span className="ml-0.5 text-[13px] text-white/55">%</span>
                    </p>
                </div>
            </div>

            <div className="mt-3.5 flex items-end gap-4">
                <div className="shrink-0">
                    <Eyebrow>Peso medio 7 días</Eyebrow>
                    <p className="mt-1 text-white">
                        <span className="nt-number text-[30px] leading-none">72,4</span>
                        <span className="ml-1 text-[13px] text-white/55">kg</span>
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-emerald-300">−1,5 kg en 8 semanas</p>
                </div>

                <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ml-auto shrink-0 overflow-visible" aria-hidden>
                    <defs>
                        <linearGradient id="bp-weight" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#3D8CFF" stopOpacity="0.32" />
                            <stop offset="100%" stopColor="#3D8CFF" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {[0.33, 0.66].map(f => (
                        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 5" />
                    ))}
                    <path d={`${d} L ${end.x} ${H} L 6 ${H} Z`} fill="url(#bp-weight)" className="nt-fade" style={{ animationDelay: '700ms' }} />
                    <path d={d} pathLength={1} fill="none" stroke="#3D8CFF" strokeWidth="2.5" strokeLinecap="round" className="nt-draw" style={{ animationDelay: '250ms' }} />
                    <circle cx={end.x} cy={end.y} r="4.5" fill="#3D8CFF" stroke="#131826" strokeWidth="2" className="nt-pop-in" style={{ animationDelay: '1500ms', transformOrigin: `${end.x}px ${end.y}px` }} />
                </svg>
            </div>
        </Tile>
    )
}

const VOLUME = [
    { label: 'Pierna', sets: 18 },
    { label: 'Espalda', sets: 16 },
    { label: 'Pecho', sets: 14 },
    { label: 'Hombro', sets: 10 },
]

function WeeklyVolume() {
    return (
        <Tile delay={120} className="flex flex-col">
            <Eyebrow>Volumen semanal</Eyebrow>
            <p className="mt-2 text-white">
                <span className="nt-number text-[32px] leading-none">58</span>
                <span className="ml-1.5 text-[15px] text-white/55">series</span>
            </p>
            <p className="mt-1 text-[12.5px] text-white/55">+6 frente a la anterior</p>
            <div className="mt-auto space-y-2.5 pt-3">
                {VOLUME.map((row, i) => (
                    <div key={row.label}>
                        <div className="flex items-baseline justify-between text-[12.5px]">
                            <span className="font-medium text-white">{row.label}</span>
                            <span className="tabular-nums text-white/55">{row.sets}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                            <div
                                className="nt-grow h-full rounded-full bg-[#3D8CFF]"
                                style={{ width: `${(row.sets / 20) * 100}%`, animationDelay: `${350 + i * 90}ms` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </Tile>
    )
}

const MONTHS = [
    { label: 'jun', pct: 62 },
    { label: 'jul', pct: 70 },
    { label: 'ago', pct: 55 },
    { label: 'sep', pct: 78 },
    { label: 'oct', pct: 88 },
    { label: 'nov', pct: 100, current: true },
]

function Billing() {
    return (
        <Tile delay={220} className="flex flex-col">
            <Eyebrow>Cobrado · noviembre</Eyebrow>
            <p className="mt-2 text-white">
                <span className="nt-number text-[32px] leading-none">1.230</span>
                <span className="ml-1 text-[15px] text-white/55">€</span>
            </p>
            <p className="mt-1 text-[12.5px] text-white/55">de 1.560 € previstos</p>

            {/* Lo cobrado en los últimos seis meses, como la vista anual de Facturación */}
            <div className="mt-4 flex h-[62px] gap-1.5">
                {MONTHS.map((month, i) => (
                    <div key={month.label} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex w-full flex-1 items-end">
                            <div
                                className={cn('nt-rise w-full rounded-[5px]', month.current ? 'bg-emerald-400' : 'bg-white/[0.14]')}
                                style={{ height: `${month.pct}%`, animationDelay: `${400 + i * 70}ms` }}
                            />
                        </div>
                        <span className={cn('text-[10.5px] leading-none', month.current ? 'font-semibold text-white' : 'text-white/45')}>{month.label}</span>
                    </div>
                ))}
            </div>

            <div className="mt-auto pt-3">
                <p className="mb-2 text-[12px] text-white/55"><span className="nt-number text-[14px] text-white">79 %</span> del mes</p>
                <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full">
                    <div className="nt-grow h-full rounded-full bg-emerald-400" style={{ width: '79%', animationDelay: '450ms' }} />
                    <div className="nt-grow h-full rounded-full bg-amber-400" style={{ width: '21%', animationDelay: '750ms' }} />
                </div>
                <div className="mt-3 space-y-1.5 text-[12.5px]">
                    <p className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-white/70"><span className="h-2 w-2 rounded-full bg-emerald-400" />Cobrado</span>
                        <span className="tabular-nums text-white">12 atletas</span>
                    </p>
                    <p className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-white/70"><span className="h-2 w-2 rounded-full bg-amber-400" />Pendiente</span>
                        <span className="tabular-nums text-white">3 atletas</span>
                    </p>
                </div>
            </div>
        </Tile>
    )
}

// ------------------------------------------------------------- Móvil del atleta

const TABS = [
    { icon: Dumbbell, label: 'Fuerza', active: true },
    { icon: Salad, label: 'Dieta' },
    { icon: CalendarDays, label: 'Plan' },
    { icon: ChartNoAxesColumnIncreasing, label: 'Progreso' },
    { icon: MessageCircle, label: 'Chat' },
]

const SETS: Array<[number, string, string, boolean]> = [
    [1, '80', '10', true],
    [2, '80', '9', true],
    [3, '80', '8', false],
]

/** La pestaña Fuerza de la app del atleta: registra sus series mientras entrena. */
function Phone() {
    return (
        <div className="nt-rise h-full rounded-[38px] bg-[#1A1D24] p-[6px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] ring-1 ring-white/15" style={{ animationDelay: '320ms' }}>
            <div className="relative h-full overflow-hidden rounded-[32px] bg-[#090E1A] px-3.5 pt-9 text-white">
                <span className="absolute left-1/2 top-2.5 h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-black" />

                <Eyebrow className="text-[10px]">Miércoles 11 nov</Eyebrow>
                <p className="nt-display mt-1 text-[21px] leading-tight text-white">Día 2 · Torso A</p>

                <div className="mt-3 rounded-[18px] bg-[#131826] p-3 ring-1 ring-[#3D8CFF]/40">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0058D8] text-[12px] font-bold">1</span>
                        <p className="text-[15px] font-semibold">Press banca</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {['3 series', '8-10 reps', 'RIR 2'].map(chip => (
                            <span key={chip} className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/75">{chip}</span>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-[22px_1fr_1fr] gap-x-1.5 text-center">
                        <span />
                        <span className="nt-eyebrow text-[10px] text-white/45">Kg</span>
                        <span className="nt-eyebrow text-[10px] text-white/45">Reps</span>
                    </div>
                    <div className="mt-1 space-y-1.5">
                        {SETS.map(([n, kg, reps, done], i) => (
                            <div
                                key={n}
                                className="nt-fade grid grid-cols-[22px_1fr_1fr] items-center gap-x-1.5 text-center"
                                style={{ animationDelay: `${900 + i * 220}ms` }}
                            >
                                <span className="text-[12px] font-semibold text-white/45">{n}</span>
                                <span className={cn('rounded-lg py-1 text-[15px] font-bold', done ? 'bg-emerald-400/[0.14] text-emerald-300' : 'bg-white/[0.08]')}>{kg}</span>
                                <span className={cn('rounded-lg py-1 text-[15px] font-bold', done ? 'bg-emerald-400/[0.14] text-emerald-300' : 'bg-[#3D8CFF]/25 text-[#8AB9FF]')}>{reps}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {['Remo con barra', 'Press militar'].map((name, i) => (
                    <div key={name} className="mt-2 flex items-center gap-2 rounded-[14px] bg-[#131826] px-3 py-2.5 ring-1 ring-white/[0.08]">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold text-white/60">{i + 2}</span>
                        <p className="truncate text-[13.5px] font-semibold">{name}</p>
                    </div>
                ))}

                <div className="absolute inset-x-2 bottom-2.5 grid grid-cols-5 gap-0.5 rounded-full bg-[#0B0D12] p-1 ring-1 ring-white/10">
                    {TABS.map(tab => (
                        <span
                            key={tab.label}
                            className={cn('flex h-[40px] flex-col items-center justify-center gap-0.5 rounded-full', tab.active ? 'bg-white text-[#0B0D12]' : 'text-white/55')}
                        >
                            <tab.icon className={cn('h-[15px] w-[15px]', tab.active && 'text-[#0058D8]')} />
                            <span className="text-[9.5px] font-semibold leading-none">{tab.label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}
