'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import {
    ArrowRight,
    CalendarDays,
    ChartNoAxesColumnIncreasing,
    Dumbbell,
    Footprints,
    MessageCircle,
    Salad,
} from 'lucide-react'
import { AthleteAvatar } from '@/components/coach/AthleteAvatar'
import { ProgressRing } from '@/components/ui/progress-ring'
import { cn } from '@/lib/utils'

/*
 * Panel de marca de las pantallas de acceso (solo escritorio). Siempre en tinta,
 * como la web comercial, y con dos pantallas reales de la app tal y como son
 * tras el rediseño: el panel del día del entrenador y el Plan en el móvil del
 * atleta. Se dibujan a tamaño fijo y se escalan al hueco que haya, para que no
 * se corten en ninguna resolución. Los datos son de ejemplo.
 */

type Focus = 'both' | 'athlete'

const STAGE = {
    both: { w: 604, h: 548 },
    athlete: { w: 254, h: 504 },
} as const

export function BrandPanel({ title, text, focus = 'both' }: { title?: React.ReactNode; text?: string; focus?: Focus }) {
    return (
        <aside className="hidden p-3 lg:flex lg:w-[48%] xl:w-[52%]" aria-hidden>
            <div className="nt-stage flex w-full flex-col rounded-[28px] px-10 pb-8 pt-10 xl:px-14 xl:pt-12">
                <div className="shrink-0">
                    <p className="nt-eyebrow nt-eyebrow-line text-white/50">
                        {focus === 'athlete' ? 'Tu app de entrenamiento' : 'Panel del entrenador y app del atleta'}
                    </p>
                    <h2 className="nt-display mt-5 max-w-[30rem] text-[2.4rem] text-white xl:text-[2.85rem]">
                        {title ?? <>Entrena a cada atleta como si fuera <span className="text-[#3D8CFF]">el único.</span></>}
                    </h2>
                    <p className="mt-4 max-w-[30rem] text-[15px] leading-relaxed text-white/60 [@media(max-height:820px)]:hidden">
                        {text ?? 'Tú ves cada día a quién atender. Tu atleta tiene su plan, su dieta y su chat en el móvil. Todo conectado.'}
                    </p>
                </div>

                <FitStage w={STAGE[focus].w} h={STAGE[focus].h}>
                    {focus === 'athlete' ? (
                        <div className="absolute left-0 top-0">
                            <AthletePhone />
                        </div>
                    ) : (
                        <>
                            <div className="absolute left-0 top-0">
                                <CoachDayPanel />
                            </div>
                            {/* El móvil solo pisa el marco del panel: no tapa nada de lo que enseña */}
                            <div className="absolute left-[362px] top-[44px]">
                                <AthletePhone />
                            </div>
                        </>
                    )}
                </FitStage>

                <p className="nt-eyebrow shrink-0 text-[10px] text-white/35">Pantallas reales de NexTrain · datos de ejemplo</p>
            </div>
        </aside>
    )
}

/** Encaja un dibujo de tamaño fijo en el hueco libre (ancho y alto), sin pasar de 1,15×. */
function FitStage({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
    const box = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState<number | null>(null)

    useLayoutEffect(() => {
        const el = box.current
        if (!el) return
        const update = () => {
            const next = Math.min(el.clientWidth / w, el.clientHeight / h, 1.15)
            setScale(next > 0 ? next : null)
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(el)
        return () => observer.disconnect()
    }, [w, h])

    return (
        <div ref={box} className="relative my-6 min-h-0 flex-1">
            <div
                className="absolute left-1/2 top-1/2 transition-opacity duration-500"
                style={{
                    width: w,
                    height: h,
                    transform: `translate(-50%, -50%) scale(${scale ?? 0.8})`,
                    opacity: scale ? 1 : 0,
                }}
            >
                {children}
            </div>
        </div>
    )
}

// ------------------------------------------------------------- Entrenador

const WALL: Array<{ name: string; severity?: 'high' | 'medium' }> = [
    { name: 'Laura Benítez', severity: 'high' },
    { name: 'Hugo Navarro' },
    { name: 'Clara Vidal' },
    { name: 'Rubén Soto', severity: 'medium' },
    { name: 'Alba Ferrer' },
    { name: 'Teo Campos' },
    { name: 'Elena Marín' },
    { name: 'Iván Torres', severity: 'high' },
    { name: 'Sara Prieto' },
    { name: 'Nerea Castro' },
    { name: 'Marcos Ruiz' },
    { name: 'Irene Mora' },
]

const RING = { high: '#F87171', medium: '#FBBF24' } as const

function initials(name: string) {
    return name.split(' ').map(part => part[0]).slice(0, 2).join('')
}

/** El panel del día del Dashboard del entrenador, en su versión apilada. */
function CoachDayPanel() {
    const pulse = [
        { label: 'Bandeja de hoy', value: 3, helper: 'Mensajes y revisiones', dot: null },
        { label: 'Prioridad alta', value: 2, helper: 'Atiéndelos hoy', dot: RING.high },
        { label: 'Prioridad media', value: 1, helper: 'Esta semana', dot: RING.medium },
        { label: 'Próximos 7 días', value: 5, helper: 'Revisiones en agenda', dot: null },
    ]
    return (
        <div className="w-[372px] rounded-[24px] bg-[#090E1A] p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.12]">
            <div className="nt-stage rounded-[20px] p-5">
                <p className="nt-eyebrow text-[10.5px] text-white/50">Miércoles 11 de noviembre</p>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
                    {pulse.map(item => (
                        <div key={item.label} className="min-w-0">
                            <p className="nt-eyebrow flex items-center gap-1.5 text-[10px] text-white/50">
                                {item.dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.dot }} />}
                                <span className="truncate">{item.label}</span>
                            </p>
                            <p className="nt-number mt-1 text-[32px] leading-none text-white" style={item.dot ? { color: item.dot } : undefined}>
                                {item.value}
                            </p>
                            <p className="mt-1 truncate text-[12px] text-white/55">{item.helper}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="flex items-baseline justify-between">
                        <p className="nt-eyebrow text-[10px] text-white/50">Atletas activos</p>
                        <p className="text-[12px] text-white/55">
                            <span className="nt-number text-[17px] text-white">12</span> · todos con seguimiento
                        </p>
                    </div>
                    <div className="mt-3.5 grid grid-cols-6 justify-items-center gap-y-3">
                        {WALL.map(athlete => (
                            <span key={athlete.name} className={cn('relative block rounded-full', athlete.severity ? 'scale-110' : 'opacity-25 grayscale')}>
                                {athlete.severity && (
                                    <span className="absolute -inset-[4px] rounded-full border-2" style={{ borderColor: RING[athlete.severity] }} />
                                )}
                                <AthleteAvatar initials={initials(athlete.name)} seed={athlete.name} className="h-9 w-9 ring-1 ring-white/10" fallbackClassName="text-[12px]" />
                            </span>
                        ))}
                    </div>
                </div>

                <span className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12.5px] font-semibold text-[#0B0D12]">
                    Empezar por Laura <ArrowRight className="h-3.5 w-3.5" />
                </span>
            </div>
        </div>
    )
}

// ------------------------------------------------------------- Atleta

const DAYS = [
    { d: 'L', n: 9, dots: ['#14B8A6'] },
    { d: 'M', n: 10, dots: ['#EF4444'] },
    { d: 'X', n: 11, dots: ['#14B8A6', '#F59E0B'], today: true },
    { d: 'J', n: 12, dots: ['#EF4444'] },
    { d: 'V', n: 13, dots: [] },
    { d: 'S', n: 14, dots: ['#14B8A6'] },
    { d: 'D', n: 15, dots: ['#F59E0B'] },
]

const TABS = [
    { icon: Dumbbell, label: 'Fuerza' },
    { icon: Salad, label: 'Dieta' },
    { icon: CalendarDays, label: 'Plan', active: true },
    { icon: ChartNoAxesColumnIncreasing, label: 'Progreso' },
    { icon: MessageCircle, label: 'Chat' },
]

/** La pantalla Plan de la app del atleta, en el móvil. */
function AthletePhone() {
    return (
        <div className="w-[242px] rounded-[38px] bg-[#1A1D24] p-[6px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] ring-1 ring-white/15">
            <div className="relative h-[492px] overflow-hidden rounded-[32px] bg-[#090E1A] px-3.5 pt-9 text-white">
                <span className="absolute left-1/2 top-2.5 h-[18px] w-[72px] -translate-x-1/2 rounded-full bg-black" />

                <p className="nt-eyebrow text-[9.5px] text-white/50">Esta semana</p>
                <p className="nt-display mt-0.5 text-[24px] text-white">Plan</p>

                <div className="mt-3 grid grid-cols-7 text-center">
                    {DAYS.map(day => (
                        <div key={day.d} className={cn('mx-0.5 rounded-xl py-1.5', day.today && 'bg-[#0058D8]')}>
                            <p className={cn('text-[9.5px]', day.today ? 'text-white/80' : 'text-white/45')}>{day.d}</p>
                            <p className="mt-0.5 text-[13px] font-semibold">{day.n}</p>
                            <p className="mt-1 flex h-1 justify-center gap-0.5">
                                {day.dots.map((color, i) => (
                                    <span key={i} className="h-1 w-1 rounded-full" style={{ backgroundColor: day.today ? '#fff' : color }} />
                                ))}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="nt-stage mt-3.5 rounded-[18px] p-3.5">
                    <div className="flex items-center gap-2.5">
                        <ProgressRing value={3 / 7} size={44} stroke={4.5} className="[&_circle:first-child]:stroke-white/10">
                            <span className="nt-number text-[11px] text-white">43%</span>
                        </ProgressRing>
                        <div className="min-w-0 flex-1">
                            <p className="nt-eyebrow text-[8.5px] leading-snug text-white/50">Progreso semanal</p>
                            <p className="nt-title text-[15px] leading-tight text-white">
                                <span className="nt-number">3</span> <span className="font-normal text-white/55">de 7 sesiones</span>
                            </p>
                            <p className="text-[10.5px] text-white/55">21,4 km / 38 km</p>
                        </div>
                    </div>
                    <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
                        {[
                            { label: 'Running', value: '2/4', pct: 56, color: 'bg-emerald-500' },
                            { label: 'Fuerza', value: '1/3', pct: 33, color: 'bg-orange-500' },
                        ].map(sport => (
                            <div key={sport.label}>
                                <div className="flex justify-between text-[10.5px]">
                                    <span className="font-medium text-white">{sport.label}</span>
                                    <span className="text-white/55">{sport.value}</span>
                                </div>
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                                    <div className={cn('h-full rounded-full', sport.color)} style={{ width: `${sport.pct}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="mt-3.5 text-[12px] font-semibold text-[#3D8CFF]">Hoy <span className="font-normal text-white/50">11 nov</span></p>
                <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#131826] p-2.5 shadow-[inset_3px_0_0_#14B8A6]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
                        <Footprints className="h-4 w-4 text-teal-300" />
                    </span>
                    <div className="min-w-0">
                        <p className="nt-eyebrow text-[8.5px] text-white/50">Rodaje</p>
                        <p className="truncate text-[12.5px] font-semibold">Rodaje suave 8 km</p>
                    </div>
                </div>

                <div className="absolute inset-x-2.5 bottom-3 grid grid-cols-5 gap-0.5 rounded-full bg-[#0B0D12]/95 p-1 ring-1 ring-white/10">
                    {TABS.map(tab => (
                        <span
                            key={tab.label}
                            className={cn(
                                'flex h-[42px] flex-col items-center justify-center gap-0.5 rounded-full',
                                tab.active ? 'bg-white text-[#0B0D12]' : 'text-white/55',
                            )}
                        >
                            <tab.icon className={cn('h-4 w-4', tab.active && 'text-[#0058D8]')} />
                            <span className="text-[8.5px] font-semibold">{tab.label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}
