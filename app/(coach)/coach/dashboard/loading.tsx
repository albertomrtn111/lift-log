/** Carga del dashboard con la misma forma que la pantalla: panel del día y dos columnas. */
export default function DashboardLoading() {
    return (
        <div className="min-h-screen pb-28 lg:pb-10">
            <div className="mx-auto max-w-[1360px] space-y-5 px-3 pt-3 sm:px-4 lg:space-y-6 lg:px-8 lg:pt-8">
                <section className="nt-stage rounded-[28px] px-5 pb-7 pt-6 sm:px-8">
                    <div className="h-3 w-56 rounded-full bg-white/10" />
                    <div className="mt-7 grid gap-8 lg:grid-cols-2">
                        <div className="grid grid-cols-2 gap-x-10 gap-y-7">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="space-y-2.5">
                                    <div className="h-2.5 w-24 rounded-full bg-white/10" />
                                    <div className="h-9 w-14 rounded-xl bg-white/10" />
                                    <div className="h-3 w-32 rounded-full bg-white/[0.07]" />
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-6 gap-3 border-white/10 lg:border-l lg:pl-12">
                            {Array.from({ length: 12 }, (_, i) => (
                                <div key={i} className="h-10 w-10 rounded-full bg-white/[0.08] sm:h-12 sm:w-12" />
                            ))}
                        </div>
                    </div>
                </section>
                <div className="grid gap-5 lg:gap-6 xl:grid-cols-[1.55fr_1fr]">
                    {[6, 5].map((rows, col) => (
                        <div key={col} className="nt-card rounded-2xl border border-border/70 bg-card p-5">
                            <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
                            <div className="mt-5 space-y-4">
                                {Array.from({ length: rows }, (_, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3.5 w-2/5 animate-pulse rounded-md bg-muted" />
                                            <div className="h-3 w-3/5 animate-pulse rounded-md bg-muted" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
