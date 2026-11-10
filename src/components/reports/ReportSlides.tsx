'use client'

import { Download, FileText } from 'lucide-react'
import type { ReportPayload } from '@/components/reports/ReportDocument'
import { isReadablePrimary, NEXTRAIN_PRIMARY } from '@/lib/branding/branding-rules'
import { formatShortDate } from '@/lib/studio/grid-rules'
import { presentationSlides } from '@/lib/studio/report-rules'

/** El informe en diapositivas 16:9: portada, una por subbloque y el cierre. Se imprime una por página. */
export function ReportSlides({ report, documentHref }: { report: ReportPayload; documentHref: string }) {
    const { brand, snapshot } = report
    const color = brand.color && isReadablePrimary(brand.color) ? brand.color : NEXTRAIN_PRIMARY
    const { session } = snapshot
    const slides = presentationSlides(snapshot.groups, 4)
    const sessionLine = [session.number ? `Sesión ${session.number}` : null, formatShortDate(session.date), session.name, session.professional]
        .filter(Boolean)
        .join(' · ')
    const total = slides.length + (snapshot.rpe !== null ? 2 : 1)

    return (
        <div className="min-h-dvh bg-slate-200 py-6 text-slate-900 print:bg-white print:py-0">
            <style>{'@page { size: 1280px 720px; margin: 0 } @media print { .nt-slide { width: 1280px !important; height: 720px !important; max-width: none !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-after: page; } }'}</style>

            <Slide color={color} brand={brand} number={1} total={total}>
                <div className="flex h-full flex-col justify-center">
                    <p className="text-[2.2cqw] font-semibold" style={{ color }}>Informe de sesión de entrenamiento</p>
                    <h1 className="mt-[1cqw] text-[5.5cqw] font-bold leading-tight">{snapshot.client}</h1>
                    <p className="mt-[1cqw] text-[2cqw] text-slate-600">{sessionLine}</p>
                    {snapshot.stats && (
                        <div className="mt-[4cqw] grid max-w-[60cqw] grid-cols-3 gap-[1.5cqw]">
                            <Big label="Ejercicios" value={snapshot.stats.exercises} color={color} />
                            <Big label="Series" value={snapshot.stats.sets} color={color} />
                            <Big label="Bloques" value={snapshot.stats.blocks || '—'} color={color} />
                        </div>
                    )}
                    {(snapshot.arrival.score !== null || snapshot.arrival.note) && (
                        <p className="mt-[3cqw] text-[1.8cqw] text-slate-600">
                            Cómo llegabas: {[snapshot.arrival.score !== null ? `${snapshot.arrival.score.toLocaleString('es-ES')} sobre 10` : null, snapshot.arrival.note].filter(Boolean).join(' · ')}
                        </p>
                    )}
                </div>
            </Slide>

            {slides.map((slide, index) => (
                <Slide key={index} color={color} brand={brand} number={index + 2} total={total}>
                    <div className="flex h-full flex-col">
                        <h2 className="text-[2.6cqw] font-bold uppercase tracking-wide" style={{ color }}>
                            {[slide.parent, slide.title ?? 'Ejercicios'].filter(Boolean).join(' › ')}
                            {slide.parts > 1 && <span className="ml-[1cqw] text-[1.6cqw] font-medium text-slate-500">{slide.part}/{slide.parts}</span>}
                        </h2>
                        <ul className="mt-[2cqw] flex flex-1 flex-col justify-start gap-[1.2cqw]">
                            {slide.exercises.map((exercise, position) => (
                                <li key={position} className="rounded-[1cqw] bg-slate-50 px-[2cqw] py-[1.3cqw]">
                                    <div className="flex items-baseline justify-between gap-[2cqw]">
                                        <p className="min-w-0 text-[2.2cqw] font-semibold leading-tight">{exercise.name}</p>
                                        <p className="shrink-0 text-[2.2cqw] font-bold">
                                            {[exercise.volume, exercise.load].filter(Boolean).join(' · ')}
                                            {exercise.nextLoad && <span className="ml-[0.6cqw]" style={{ color }}>{exercise.nextLoad}</span>}
                                        </p>
                                    </div>
                                    {[exercise.details, exercise.tags.join(', '), exercise.evolution].some(Boolean) && (
                                        <p className="text-[1.6cqw] text-slate-600">
                                            {[exercise.details, exercise.tags.join(', '), exercise.evolution].filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                    {exercise.people?.map((line: string) => <p key={line} className="text-[1.5cqw] text-slate-600">{line}</p>)}
                                </li>
                            ))}
                        </ul>
                    </div>
                </Slide>
            ))}

            {snapshot.rpe !== null && (
                <Slide color={color} brand={brand} number={total} total={total}>
                    <div className="flex h-full flex-col justify-center">
                        <h2 className="text-[3cqw] font-bold" style={{ color }}>Al terminar</h2>
                        <div className="mt-[3cqw] grid max-w-[70cqw] grid-cols-3 gap-[1.5cqw]">
                            <Big label="RPE" value={snapshot.rpe.toLocaleString('es-ES')} color={color} />
                            <Big label="Minutos" value={snapshot.duration ?? '—'} color={color} />
                            <Big label="Carga" value={snapshot.load ?? '—'} color={color} />
                        </div>
                    </div>
                </Slide>
            )}

            <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-3 p-4 print:hidden">
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white"
                    style={{ backgroundColor: color }}
                >
                    <Download className="h-4 w-4" /> Descargar PDF
                </button>
                <a href={documentHref} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4" /> Ver como documento
                </a>
            </div>
        </div>
    )
}

function Slide({ color, brand, number, total, children }: {
    color: string
    brand: ReportPayload['brand']
    number: number
    total: number
    children: React.ReactNode
}) {
    return (
        <section className="nt-slide mx-auto mb-6 aspect-video w-[min(100%-2rem,64rem)] overflow-hidden rounded-xl bg-white shadow-md [container-type:inline-size]">
            <div className="flex h-full flex-col px-[5cqw] py-[3.5cqw]">
                <div className="min-h-0 flex-1">{children}</div>
                <footer className="mt-[1.5cqw] flex items-center justify-between border-t-2 pt-[1cqw] text-[1.4cqw] text-slate-500" style={{ borderColor: color }}>
                    {brand.logo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={brand.logo} alt={brand.name ?? ''} className="h-[3cqw] max-w-[16cqw] object-contain" />
                        : <span className="font-semibold">{brand.name}</span>}
                    <span>{brand.footer || ''}</span>
                    <span>{number}/{total}</span>
                </footer>
            </div>
        </section>
    )
}

function Big({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
        <div className="rounded-[1.2cqw] bg-slate-100 p-[1.6cqw] text-center">
            <p className="text-[4cqw] font-bold leading-none" style={{ color }}>{value}</p>
            <p className="mt-[0.6cqw] text-[1.5cqw] text-slate-600">{label}</p>
        </div>
    )
}
