'use client'

import { Download } from 'lucide-react'
import { isReadablePrimary, NEXTRAIN_PRIMARY } from '@/lib/branding/branding-rules'
import { formatShortDate } from '@/lib/studio/grid-rules'

interface ReportExercise {
    name: string
    volume: string
    load: string
    nextLoad: string
    details: string
    tags: string[]
    evolution: string | null
    sets: { load: number | null; reps: number | null }[]
    /** Solo en el informe de una clase. Los informes antiguos no lo traen. */
    people?: string[]
}

export interface ReportPayload {
    brand: { name: string | null; logo: string | null; color: string | null; footer: string | null }
    snapshot: {
        client: string
        session: { number: number | null; date: string; name: string | null; professional: string | null }
        stats: { exercises: number; sets: number; blocks: number } | null
        arrival: { score: number | null; note: string | null }
        groups: { title: string | null; parent: string | null; exercises: ReportExercise[] }[]
        rpe: number | null
        duration: number | null
        load: number | null
    }
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg bg-slate-100 p-3 text-center">
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-slate-600">{label}</p>
        </div>
    )
}

/** La página y el PDF son lo mismo: se imprime esta misma página. Siempre en claro, como un documento. */
export function ReportDocument({ report }: { report: ReportPayload }) {
    const { brand, snapshot } = report
    const color = brand.color && isReadablePrimary(brand.color) ? brand.color : NEXTRAIN_PRIMARY
    const { session } = snapshot

    return (
        <div className="min-h-dvh bg-slate-100 text-slate-900 print:bg-white">
            <main className="mx-auto max-w-[210mm] bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none">
                <header className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: color }}>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color }}>Informe de sesión de entrenamiento</p>
                        <h1 className="text-2xl font-bold">{snapshot.client}</h1>
                        <p className="text-sm text-slate-600">
                            {[session.number ? `Sesión ${session.number}` : null, formatShortDate(session.date), session.name, session.professional]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>
                    {brand.logo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={brand.logo} alt={brand.name ?? ''} className="h-12 max-w-[9rem] shrink-0 object-contain" />
                        : <p className="shrink-0 font-semibold">{brand.name}</p>}
                </header>

                {snapshot.stats && (
                    <section className="mt-5 grid grid-cols-3 gap-3" aria-label="Resumen">
                        <Stat label="Ejercicios" value={snapshot.stats.exercises} />
                        <Stat label="Series" value={snapshot.stats.sets} />
                        <Stat label="Bloques" value={snapshot.stats.blocks || '—'} />
                    </section>
                )}

                {(snapshot.arrival.score !== null || snapshot.arrival.note) && (
                    <section className="mt-5 rounded-lg border p-3 text-sm">
                        <h2 className="font-semibold">Cómo llegabas</h2>
                        {snapshot.arrival.score !== null && <p>{snapshot.arrival.score.toLocaleString('es-ES')} sobre 10</p>}
                        {snapshot.arrival.note && <p className="text-slate-600">{snapshot.arrival.note}</p>}
                    </section>
                )}

                {snapshot.groups.map((group, index) => (
                    <section key={index} className="mt-6 break-inside-avoid-page">
                        {group.title && (
                            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color }}>
                                {group.parent ? `${group.parent} › ` : ''}{group.title}
                            </h2>
                        )}
                        <ul className="divide-y rounded-lg border">
                            {group.exercises.map((exercise, position) => (
                                <li key={position} className="break-inside-avoid p-3 text-sm">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <p className="min-w-0 font-semibold">{exercise.name}</p>
                                        <p className="shrink-0 font-semibold">
                                            {[exercise.volume, exercise.load].filter(Boolean).join(' · ')}
                                            {exercise.nextLoad && <span className="ml-1" style={{ color }}>{exercise.nextLoad}</span>}
                                        </p>
                                    </div>
                                    <p className="text-slate-600">
                                        {[exercise.details, exercise.tags.join(', '), exercise.evolution].filter(Boolean).join(' · ')}
                                    </p>
                                    {exercise.sets.length > 0 && (
                                        <p className="text-slate-600">
                                            {exercise.sets.map((set, order) => `${order + 1}: ${[set.load !== null ? `${set.load} kg` : null, set.reps !== null ? `${set.reps} reps` : null].filter(Boolean).join(' × ')}`).join('   ')}
                                        </p>
                                    )}
                                    {exercise.people?.map(line => <p key={line} className="text-slate-600">{line}</p>)}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}

                {snapshot.rpe !== null && (
                    <section className="mt-6 grid grid-cols-3 gap-3" aria-label="Al terminar">
                        <Stat label="RPE" value={snapshot.rpe.toLocaleString('es-ES')} />
                        <Stat label="Minutos" value={snapshot.duration ?? '—'} />
                        <Stat label="Carga" value={snapshot.load ?? '—'} />
                    </section>
                )}

                <footer className="mt-8 border-t pt-3 text-center text-xs text-slate-500">
                    {brand.footer || brand.name}
                </footer>
            </main>

            <div className="mx-auto max-w-[210mm] p-4 text-center print:hidden">
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white"
                    style={{ backgroundColor: color }}
                >
                    <Download className="h-4 w-4" /> Descargar PDF
                </button>
            </div>
        </div>
    )
}
