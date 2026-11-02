import { Activity, Apple, Check, Dumbbell, MessageSquare, Receipt, Sparkles } from 'lucide-react'

const FEATURES = [
    { icon: Dumbbell, label: 'Fuerza y cardio' },
    { icon: Apple, label: 'Nutrición' },
    { icon: Sparkles, label: 'Check-ins con IA' },
    { icon: Receipt, label: 'Cobros' },
]

/**
 * Panel de marca (solo escritorio). Siempre oscuro, con una vista previa
 * ilustrativa de la app hecha con HTML: no son datos reales.
 */
export function BrandPanel({ title, text }: { title?: React.ReactNode; text?: string }) {
    return (
        <aside className="hidden p-3 lg:flex lg:w-[48%] xl:w-[52%]" aria-hidden>
            <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-[28px] bg-[#070b16] p-10 text-white xl:p-14">
                {/* Fondo: rejilla difuminada + brillos */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.35]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                        backgroundSize: '44px 44px',
                        maskImage: 'radial-gradient(ellipse at 70% 30%, black 20%, transparent 70%)',
                        WebkitMaskImage: 'radial-gradient(ellipse at 70% 30%, black 20%, transparent 70%)',
                    }}
                />
                <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand/35 blur-[120px]" />
                <div className="pointer-events-none absolute -bottom-40 -left-24 h-[24rem] w-[24rem] rounded-full bg-[hsl(155_60%_40%/0.18)] blur-[120px]" />

                <div className="relative">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70 backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Plataforma para entrenadores
                    </span>
                    <h2 className="mt-6 max-w-md text-4xl font-semibold leading-[1.08] tracking-tight xl:text-[2.75rem]">
                        {title ?? <>Todo tu coaching,<br /><span className="text-white/50">en un solo sitio.</span></>}
                    </h2>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">
                        {text ?? 'Programas, nutrición, revisiones y cobros. Tus atletas lo tienen todo en su app; tú lo controlas desde aquí.'}
                    </p>
                </div>

                {/* Vista previa de la app */}
                <div className="relative mx-auto my-10 grid w-full max-w-[540px] grid-cols-2 gap-3.5 xl:grid-cols-[1.4fr_1fr]">
                    <GlassCard className="col-span-2 xl:col-span-1">
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-light to-brand text-xs font-semibold">LM</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">Laura M.</p>
                                <p className="text-xs text-white/45">Check-in semanal</p>
                            </div>
                            <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                <Check className="h-3 w-3" /> Revisado
                            </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <Stat label="Peso" value="62,4" unit="kg" delta="−0,6" />
                            <Stat label="Adherencia" value="94" unit="%" />
                            <Stat label="Sueño" value="7,5" unit="h" />
                        </div>
                        <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/[0.04] p-2.5 text-xs leading-relaxed text-white/60">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-soft" />
                            Buena semana: baja el peso sin perder fuerza. Mantén las calorías.
                        </div>
                    </GlassCard>

                    <GlassCard className="hidden xl:block">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Volumen semanal</p>
                            <Activity className="h-3.5 w-3.5 text-white/40" />
                        </div>
                        <div className="mt-4 space-y-3">
                            {[['Pierna', 18, 'bg-sky-400'], ['Espalda', 16, 'bg-blue-500'], ['Pecho', 14, 'bg-indigo-400'], ['Hombro', 10, 'bg-violet-400']].map(([label, sets, color]) => (
                                <div key={label as string}>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-white/70">{label}</span>
                                        <span className="tabular-nums text-white/45">{sets} series</span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                        <div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(sets) / 20) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                    <GlassCard>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Octubre</p>
                        <p className="mt-1.5 text-2xl font-semibold tabular-nums">1.230 €</p>
                        <p className="text-xs text-white/45">de 1.560 € previstos</p>
                        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full w-[79%] bg-emerald-400" />
                            <div className="h-full w-[15%] border-l-2 border-[#0d1322] bg-amber-400" />
                        </div>
                    </GlassCard>

                    <GlassCard>
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-white/45" />
                            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Mensajes</p>
                        </div>
                        <div className="mt-3 space-y-2 text-xs">
                            <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-white/[0.07] px-3 py-2 text-white/75">¡PR en sentadilla! 120 kg 💪</p>
                            <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-brand px-3 py-2">¡Brutal! Subimos la semana que viene</p>
                        </div>
                    </GlassCard>
                </div>

                <div className="relative flex flex-wrap gap-x-6 gap-y-3">
                    {FEATURES.map(({ icon: Icon, label }) => (
                        <span key={label} className="flex items-center gap-2 text-sm text-white/60">
                            <Icon className="h-4 w-4 text-white/40" />
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </aside>
    )
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-2xl border border-white/[0.08] bg-[#0d1322]/80 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl ${className}`}>
            {children}
        </div>
    )
}

function Stat({ label, value, unit, delta }: { label: string; value: string; unit: string; delta?: string }) {
    return (
        <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {value}<span className="ml-0.5 text-[11px] font-normal text-white/45">{unit}</span>
            </p>
            {delta && <p className="text-[10px] font-medium text-emerald-300">{delta}</p>}
        </div>
    )
}
