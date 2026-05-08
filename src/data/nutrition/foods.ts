import { createClient } from '@/lib/supabase/client'
import type { Food, FoodInput } from './tracking-types'

const FOOD_FIELDS = 'id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, serving_size_g, serving_label, source, created_by, is_public, created_at, updated_at'

/** Búsqueda de alimentos en la biblioteca compartida (nombre + marca). */
export async function searchFoods(query: string, limit = 30): Promise<Food[]> {
    const supabase = createClient()
    const q = query.trim().toLowerCase()

    let req = supabase
        .from('foods')
        .select(FOOD_FIELDS)
        .order('name', { ascending: true })
        .limit(limit)

    if (q.length > 0) {
        req = req.ilike('search_text', `%${q}%`)
    }

    const { data, error } = await req
    if (error) {
        console.error('searchFoods error:', error)
        return []
    }
    return (data ?? []) as Food[]
}

/** Lee un alimento por id. */
export async function getFoodById(id: string): Promise<Food | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('foods')
        .select(FOOD_FIELDS)
        .eq('id', id)
        .maybeSingle()
    if (error) {
        console.error('getFoodById error:', error)
        return null
    }
    return (data as Food) ?? null
}

/** Crea un alimento de usuario y devuelve la fila resultante. */
export async function createFood(input: FoodInput): Promise<Food | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const payload = {
        name: input.name.trim(),
        brand: input.brand?.trim() || null,
        kcal: input.kcal,
        protein_g: input.protein_g,
        carbs_g: input.carbs_g,
        fat_g: input.fat_g,
        fiber_g: input.fiber_g ?? null,
        sugar_g: input.sugar_g ?? null,
        sodium_mg: input.sodium_mg ?? null,
        serving_size_g: input.serving_size_g ?? 100,
        serving_label: input.serving_label ?? null,
        is_public: input.is_public ?? true,
        source: 'user' as const,
        created_by: user.id,
    }

    const { data, error } = await supabase
        .from('foods')
        .insert(payload)
        .select(FOOD_FIELDS)
        .single()

    if (error) {
        console.error('createFood error:', error)
        return null
    }
    return data as Food
}

/**
 * Devuelve los alimentos usados recientemente por el cliente actual,
 * deduplicados por food_id, ordenados por fecha desc.
 */
export async function getRecentFoodsForCurrentClient(limit = 20): Promise<Food[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()
    if (!client) return []

    const { data: entries, error } = await supabase
        .from('nutrition_log_entries')
        .select('food_id, created_at')
        .eq('client_id', client.id)
        .not('food_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)
    if (error || !entries) {
        if (error) console.error('getRecentFoods error:', error)
        return []
    }

    const seen = new Set<string>()
    const ids: string[] = []
    for (const row of entries) {
        if (row.food_id && !seen.has(row.food_id)) {
            seen.add(row.food_id)
            ids.push(row.food_id)
            if (ids.length >= limit) break
        }
    }
    if (ids.length === 0) return []

    const { data: foods } = await supabase
        .from('foods')
        .select(FOOD_FIELDS)
        .in('id', ids)

    // Preservar el orden de "ids"
    const map = new Map<string, Food>((foods ?? []).map((f: any) => [f.id, f as Food]))
    return ids.map(id => map.get(id)).filter(Boolean) as Food[]
}
