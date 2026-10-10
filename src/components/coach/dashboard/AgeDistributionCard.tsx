'use client'

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui/card'
import type { AgeDistribution } from '@/data/dashboard'

export function AgeDistributionCard({ distribution }: { distribution: AgeDistribution | null }) {
    const visibleGroups = distribution?.groups.filter((group) => group.count > 0) ?? []

    return (
        <Card className="min-w-0 overflow-hidden">
            <div className="border-b p-4">
                <h2 className="font-semibold">Atletas por grupo de edad</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Atletas activos · edad en años cumplidos
                </p>
            </div>

            {distribution === null ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                    No se pudo cargar la distribución por edades.
                </p>
            ) : distribution.known === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                    {distribution.total === 0
                        ? 'Aún no hay atletas activos.'
                        : 'Aún no hay fechas de nacimiento registradas para los atletas activos.'}
                </p>
            ) : (
                <div className="p-4">
                    <div className="mx-auto h-52 w-full max-w-60" aria-hidden="true">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={visibleGroups}
                                    dataKey="count"
                                    nameKey="label"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={88}
                                    paddingAngle={visibleGroups.length > 1 ? 2 : 0}
                                    stroke="none"
                                    isAnimationActive={false}
                                >
                                    {visibleGroups.map((group) => (
                                        <Cell key={group.key} fill={group.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <ul className="mt-3 space-y-2 text-sm" aria-label="Distribución por edades">
                        {distribution.groups.map((group) => (
                            <li key={group.key} className="flex min-w-0 items-center gap-2">
                                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: group.color }} aria-hidden="true" />
                                <span className="min-w-0 flex-1">{group.label}</span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                    {group.count} ({Math.round(group.count / distribution.known * 100)} %)
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                        {distribution.known} con fecha de nacimiento
                        {distribution.unknown > 0 && ` · ${distribution.unknown} sin fecha de nacimiento`}
                    </p>
                </div>
            )}
        </Card>
    )
}
