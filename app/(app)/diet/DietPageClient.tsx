'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronDown, Utensils } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MacroPlan } from '@/types/training'
import type { ClientDietMeal } from '@/data/diet'
import { MacrosTracker } from '@/components/nutrition/MacrosTracker'
import { DietOptionsPlan } from '@/components/nutrition/DietOptionsPlan'
import { DayNavigator } from '@/components/nutrition/DayNavigator'
import { SupplementsTracker, type ClientSupplement } from '@/components/nutrition/SupplementsTracker'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'

interface DietPlanMealItem {
    quantity: string
    name: string
    note?: string
}

interface DietPlanMealOption {
    title?: string
    name?: string
    items: DietPlanMealItem[]
    notes?: string
}

interface DietPlanMeals {
    meals_per_day: number
    labels: string[]
    days: {
        default: Record<string, { options: DietPlanMealOption[] }>
    }
}

interface ParsedDietPlan {
    id: string
    name: string
    meals: DietPlanMeals
    effectiveFrom: string
}

interface DietPageClientProps {
    macroPlan: MacroPlan | null
    dietPlan: ParsedDietPlan | null
    dietMeals: ClientDietMeal[]
    supplements: ClientSupplement[]
}

type DietTab = 'macros' | 'meals' | 'supplements'

const DIET_TAB_OPTIONS: Array<{ value: DietTab; label: string }> = [
    { value: 'macros', label: 'Macros' },
    { value: 'meals', label: 'Comidas' },
    { value: 'supplements', label: 'Suplementos' },
]

function isDietTab(value: string | null): value is DietTab {
    return value === 'macros' || value === 'meals' || value === 'supplements'
}

function parseDateParam(value: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    if (format(parsed, 'yyyy-MM-dd') !== value || parsed > new Date()) return null
    return parsed
}

export function DietPageClient({ macroPlan, dietPlan, dietMeals, supplements }: DietPageClientProps) {
    const searchParams = useSearchParams()
    const hasMacros = !!macroPlan
    const hasStructuredMeals = dietMeals.length > 0
    const hasLegacyMeals = !!(dietPlan?.meals?.labels?.length)
    const hasMeals = hasStructuredMeals || hasLegacyMeals
    const requestedTab = searchParams.get('tab')
    const initialTab: DietTab = isDietTab(requestedTab)
        ? requestedTab
        : (hasMacros ? 'macros' : (hasMeals ? 'meals' : (supplements.length > 0 ? 'supplements' : 'macros')))

    const [activeTab, setActiveTab] = useState<DietTab>(initialTab)
    // Un único día para Macros y Suplementos: cambiar de pestaña no lo pierde
    const [date, setDate] = useState<Date>(() => parseDateParam(searchParams.get('date')) ?? new Date())

    return (
        <div className="app-mobile-page min-h-screen pb-4">
            <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
                <div className="px-4 pb-3 pt-4">
                    <div className="flex min-h-10 items-end pr-24">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nutrición</p>
                            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">Dieta</h1>
                        </div>
                    </div>
                    <ClientTabSwitcher
                        className="mt-3"
                        value={activeTab}
                        options={DIET_TAB_OPTIONS}
                        onValueChange={setActiveTab}
                    />
                    {activeTab !== 'meals' && (
                        <DayNavigator className="mt-2" date={date} onChange={setDate} />
                    )}
                </div>
            </header>

            <div className="animate-fade-in px-4 pt-4" key={activeTab}>
                {activeTab === 'macros' && (
                    <MacrosTracker macroPlan={macroPlan} date={date} />
                )}

                {activeTab === 'meals' && (
                    hasStructuredMeals && dietPlan ? (
                        <DietOptionsPlan planId={dietPlan.id} planName={dietPlan.name} meals={dietMeals} />
                    ) : hasLegacyMeals && dietPlan ? (
                        <LegacyDietPlan plan={dietPlan} />
                    ) : (
                        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                <Utensils className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-semibold">Sin plan de comidas</p>
                            <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                                Tu coach aún no ha configurado un plan de comidas para ti.
                            </p>
                        </div>
                    )
                )}

                {activeTab === 'supplements' && (
                    <SupplementsTracker supplements={supplements} date={date} onDateChange={setDate} />
                )}
            </div>
        </div>
    )
}

/** Planes antiguos que solo tienen el JSON de opciones (sin estructura con macros) */
function LegacyDietPlan({ plan }: { plan: ParsedDietPlan }) {
    const [openMeal, setOpenMeal] = useState<string | null>(plan.meals.labels[0] ?? null)

    return (
        <div className="space-y-3">
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tu plan</p>
                <h2 className="text-lg font-semibold leading-tight">{plan.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Opciones propuestas por tu coach para cada comida.</p>
            </section>

            {plan.meals.labels.map(label => {
                const meal = plan.meals.days.default[label]
                if (!meal?.options?.length) return null
                const isOpen = openMeal === label
                return (
                    <article key={label} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                        <button
                            type="button"
                            onClick={() => setOpenMeal(isOpen ? null : label)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left"
                            aria-expanded={isOpen}
                        >
                            <span className="text-[15px] font-semibold">{label}</span>
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {meal.options.length} opciones
                                <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                            </span>
                        </button>
                        {isOpen && (
                            <div className="divide-y divide-border/60 border-t border-border/60">
                                {meal.options.map((option, index) => (
                                    <div key={index} className="px-4 py-3">
                                        <p className="mb-1.5 text-sm font-medium">{option.title ?? option.name ?? `Opción ${index + 1}`}</p>
                                        <ul className="space-y-1">
                                            {option.items.map((item, itemIndex) => (
                                                <li key={itemIndex} className="flex items-baseline gap-3 text-sm">
                                                    <span className="min-w-0 flex-1 text-muted-foreground">
                                                        {item.name}
                                                        {item.note && <span className="text-muted-foreground/70"> ({item.note})</span>}
                                                    </span>
                                                    {item.quantity && <span className="shrink-0 font-medium tabular-nums">{item.quantity}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                        {option.notes && (
                                            <p className="mt-2 rounded-lg bg-primary/5 px-2 py-1 text-xs text-primary">{option.notes}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>
                )
            })}
        </div>
    )
}
