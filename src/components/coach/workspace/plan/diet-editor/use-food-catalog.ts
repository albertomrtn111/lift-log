'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DietFoodRef } from '@/data/nutrition/types'

const FOOD_FIELDS = 'id, name, brand, kcal, protein_g, carbs_g, fat_g, serving_size_g, unit_weight_g, unit_label, food_group, is_generic, source'

// Biblioteca pequeña (cientos de alimentos): se carga una vez por sesión y se
// filtra en el navegador, así buscar es instantáneo mientras se edita la dieta.
let cache: Promise<DietFoodRef[]> | null = null

function toFood(row: any): DietFoodRef {
    return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        kcal: Number(row.kcal),
        protein_g: Number(row.protein_g),
        carbs_g: Number(row.carbs_g),
        fat_g: Number(row.fat_g),
        serving_size_g: Number(row.serving_size_g) || 100,
        unit_weight_g: row.unit_weight_g != null ? Number(row.unit_weight_g) : null,
        unit_label: row.unit_label,
        food_group: row.food_group,
        is_generic: Boolean(row.is_generic),
    }
}

async function loadCatalog(): Promise<DietFoodRef[]> {
    const { data, error } = await createClient()
        .from('foods')
        .select(FOOD_FIELDS)
        .order('name', { ascending: true })
        .limit(2000)

    if (error) throw new Error(error.message)
    // Los alimentos del sistema primero en caso de nombres repetidos
    const rows = (data ?? []).sort((a: any, b: any) => Number(b.source === 'system') - Number(a.source === 'system'))
    const seen = new Set<string>()
    const foods: DietFoodRef[] = []
    for (const row of rows) {
        const key = `${normalizeFoodText(row.name)}|${normalizeFoodText(row.brand ?? '')}`
        if (seen.has(key)) continue
        seen.add(key)
        foods.push(toFood(row))
    }
    return foods.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function normalizeFoodText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
}

export function useFoodCatalog() {
    const [foods, setFoods] = useState<DietFoodRef[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        cache ??= loadCatalog().catch(cause => {
            cache = null
            throw cause
        })
        cache
            .then(data => { if (active) setFoods(data) })
            .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la base de alimentos') })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [])

    return { foods, loading, error }
}

/** Búsqueda por palabras, sin tildes: "pollo pech" encuentra "Pollo pechuga" */
export function searchFoodCatalog(foods: DietFoodRef[], query: string, limit = 40) {
    const terms = normalizeFoodText(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return foods.slice(0, limit)

    const scored: { food: DietFoodRef; score: number }[] = []
    for (const food of foods) {
        const name = normalizeFoodText(food.name)
        const haystack = `${name} ${normalizeFoodText(food.brand ?? '')}`
        if (!terms.every(term => haystack.includes(term))) continue
        const score = (name.startsWith(terms[0]) ? 0 : 1) + (food.is_generic ? 0 : 0.5) + name.length / 100
        scored.push({ food, score })
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, limit).map(entry => entry.food)
}
