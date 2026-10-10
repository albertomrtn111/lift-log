'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronsUpDown, Link2, Loader2, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { DietFoodRef } from '@/data/nutrition/types'
import { searchFoodCatalog, useFoodCatalog } from './use-food-catalog'

export const FOOD_GROUP_META: Record<string, { label: string; dot: string }> = {
    protein: { label: 'Proteína', dot: 'bg-rose-500' },
    carbs: { label: 'Hidratos', dot: 'bg-amber-500' },
    fat: { label: 'Grasas', dot: 'bg-sky-500' },
    fruit: { label: 'Fruta', dot: 'bg-pink-500' },
    vegetable: { label: 'Verdura', dot: 'bg-emerald-500' },
    dairy: { label: 'Lácteo', dot: 'bg-violet-500' },
    other: { label: 'Otros', dot: 'bg-muted-foreground/50' },
}

function formatPer100(food: DietFoodRef) {
    const base = food.serving_size_g || 100
    const label = base === 100 ? '100 g' : `${base} g`
    return `${Math.round(food.kcal)} kcal · P ${food.protein_g} · C ${food.carbs_g} · G ${food.fat_g} / ${label}`
}

interface FoodPickerProps {
    value: DietFoodRef | null | undefined
    /** Texto del ítem cuando aún no está vinculado (dietas antiguas) */
    fallbackLabel?: string
    onSelect: (food: DietFoodRef) => void
    placeholder?: string
    className?: string
    compact?: boolean
    /** Botón pequeño "Vincular" en vez del selector completo */
    iconOnly?: boolean
    /** Disparador propio (p. ej. botón de icono) */
    trigger?: React.ReactNode
}

export function FoodPicker({ value, fallbackLabel, onSelect, placeholder = 'Elegir alimento', className, compact, iconOnly, trigger }: FoodPickerProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const { foods, loading, error } = useFoodCatalog()

    const results = useMemo(() => searchFoodCatalog(foods, query), [foods, query])
    const isUnlinked = !value && Boolean(fallbackLabel?.trim())

    return (
        <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }}>
            <PopoverTrigger asChild>
                {trigger ? trigger : iconOnly ? (
                    <button
                        type="button"
                        className={cn(
                            'inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-amber-500/50 bg-amber-500/5 px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400',
                            className
                        )}
                        title="Vincular a un alimento para que cuente en los macros"
                    >
                        <Link2 className="h-3.5 w-3.5" />
                        Vincular
                    </button>
                ) : (
                <button
                    type="button"
                    className={cn(
                        'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left text-sm transition-colors',
                        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        compact ? 'h-9' : 'h-10',
                        isUnlinked ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-background',
                        className
                    )}
                    title={isUnlinked ? 'Sin vincular a la base de alimentos: no cuenta para los macros' : undefined}
                >
                    {value ? (
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', FOOD_GROUP_META[value.food_group ?? 'other']?.dot)} />
                    ) : isUnlinked ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    ) : (
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn('min-w-0 flex-1 truncate', !value && !isUnlinked && 'text-muted-foreground')}>
                        {value?.name ?? (fallbackLabel?.trim() || placeholder)}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </button>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-[360px] max-w-[calc(100vw-2rem)] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar alimento…"
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList className="max-h-[320px]">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Cargando alimentos…
                            </div>
                        ) : error ? (
                            <div className="px-3 py-6 text-center text-sm text-destructive">{error}</div>
                        ) : (
                            <>
                                <CommandEmpty>No hay alimentos con ese nombre.</CommandEmpty>
                                {isUnlinked && !query && (
                                    <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                                        Vincula «{fallbackLabel}» a un alimento para que cuente en los macros.
                                    </p>
                                )}
                                <CommandGroup>
                                    {results.map(food => (
                                        <CommandItem
                                            key={food.id}
                                            value={food.id}
                                            onSelect={() => {
                                                onSelect(food)
                                                setOpen(false)
                                                setQuery('')
                                            }}
                                            className="flex items-start gap-2 py-2"
                                        >
                                            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', FOOD_GROUP_META[food.food_group ?? 'other']?.dot)} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="truncate font-medium">{food.name}</span>
                                                    {food.brand && <span className="truncate text-xs text-muted-foreground">{food.brand}</span>}
                                                    {food.is_generic && (
                                                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium uppercase text-muted-foreground">Genérico</span>
                                                    )}
                                                </span>
                                                <span className="block text-[11px] tabular-nums text-muted-foreground">
                                                    {formatPer100(food)}
                                                    {food.unit_weight_g ? ` · 1 ${food.unit_label ?? 'ud'} = ${food.unit_weight_g} g` : ''}
                                                </span>
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
