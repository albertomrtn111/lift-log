'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { kcalFromMacros, type EditorMeal, type MealTarget } from '@/lib/nutrition/diet-plan-model'

const TARGET_FIELDS = [
    { key: 'target_kcal', label: 'kcal', className: '' },
    { key: 'target_protein_g', label: 'P', className: 'text-rose-600 dark:text-rose-400' },
    { key: 'target_carbs_g', label: 'C', className: 'text-amber-600 dark:text-amber-400' },
    { key: 'target_fat_g', label: 'G', className: 'text-sky-600 dark:text-sky-400' },
] as const

type TargetKey = (typeof TARGET_FIELDS)[number]['key']

/** Campos kcal / P / C / G del objetivo de una comida */
export function MealTargetInputs({
    meal,
    onChange,
    className,
}: {
    meal: EditorMeal
    onChange: (patch: Partial<Record<TargetKey, number | null>>) => void
    className?: string
}) {
    const derivedKcal = kcalFromMacros({
        protein_g: meal.target_protein_g ?? null,
        carbs_g: meal.target_carbs_g ?? null,
        fat_g: meal.target_fat_g ?? null,
    })

    return (
        <div className={cn('grid grid-cols-4 gap-1.5', className)}>
            {TARGET_FIELDS.map(field => (
                <label key={field.key} className="relative">
                    <span className={cn('pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold', field.className || 'text-muted-foreground')}>
                        {field.label}
                    </span>
                    <Input
                        inputMode="numeric"
                        value={meal[field.key] ?? ''}
                        placeholder={field.key === 'target_kcal' && derivedKcal > 0 ? String(derivedKcal) : '—'}
                        onChange={(event) => {
                            const raw = event.target.value.replace(',', '.').trim()
                            const value = raw === '' ? null : Number(raw)
                            if (value !== null && (!Number.isFinite(value) || value < 0)) return
                            onChange({ [field.key]: value })
                        }}
                        className={cn('h-8 pr-1.5 text-right text-sm tabular-nums', field.key === 'target_kcal' ? 'pl-9' : 'pl-6')}
                        aria-label={`Objetivo ${field.label}`}
                    />
                </label>
            ))}
        </div>
    )
}

export interface MacroPlanReference {
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
}

/** Plan de macros vigente del atleta, como referencia para repartir objetivos */
export function useMacroPlanReference(clientId: string) {
    const [plan, setPlan] = useState<MacroPlanReference | null>(null)

    useEffect(() => {
        let active = true
        createClient()
            .from('macro_plans')
            .select('kcal, protein_g, carbs_g, fat_g, effective_to, effective_from')
            .eq('client_id', clientId)
            .is('effective_to', null)
            .order('effective_from', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
                if (!active || !data) return
                setPlan({
                    kcal: Number(data.kcal) || 0,
                    protein_g: Number(data.protein_g) || 0,
                    carbs_g: Number(data.carbs_g) || 0,
                    fat_g: Number(data.fat_g) || 0,
                })
            })
        return () => { active = false }
    }, [clientId])

    return plan
}

/** Suma de los objetivos de las comidas frente al plan de macros diario */
export function DailyTargetSummary({ meals, reference }: { meals: EditorMeal[]; reference: MacroPlanReference | null }) {
    const sum: MealTarget = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    for (const meal of meals) {
        const p = Number(meal.target_protein_g) || 0
        const c = Number(meal.target_carbs_g) || 0
        const f = Number(meal.target_fat_g) || 0
        sum.kcal = (sum.kcal ?? 0) + (Number(meal.target_kcal) || kcalFromMacros({ protein_g: p, carbs_g: c, fat_g: f }))
        sum.protein_g = (sum.protein_g ?? 0) + p
        sum.carbs_g = (sum.carbs_g ?? 0) + c
        sum.fat_g = (sum.fat_g ?? 0) + f
    }

    const rows = [
        { label: 'kcal', key: 'kcal' as const },
        { label: 'Proteína', key: 'protein_g' as const },
        { label: 'Hidratos', key: 'carbs_g' as const },
        { label: 'Grasa', key: 'fat_g' as const },
    ]

    return (
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
            {rows.map(row => {
                const value = Math.round(sum[row.key] ?? 0)
                const goal = reference ? Math.round(reference[row.key]) : null
                const diff = goal ? value - goal : null
                const off = goal ? Math.abs(value - goal) / goal > 0.05 : false
                return (
                    <div key={row.key}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</p>
                        <p className="text-sm font-semibold tabular-nums">
                            {value}{goal ? <span className="font-normal text-muted-foreground"> / {goal}</span> : null}
                        </p>
                        {diff !== null && value > 0 && (
                            <p className={cn('text-[11px] tabular-nums', off ? 'text-amber-600 dark:text-amber-400' : 'text-success')}>
                                {diff > 0 ? '+' : ''}{diff}
                            </p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
