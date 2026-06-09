import { createClient } from '@/lib/supabase/client'
import type { Food, Recipe, RecipeIngredient, RecipeWithIngredients } from './tracking-types'
import { macrosForFood } from './tracking-types'

const RECIPE_FIELDS = 'id, name, description, servings, serving_label, total_kcal, total_protein_g, total_carbs_g, total_fat_g, created_by, is_public, created_at, updated_at'

export async function searchRecipes(query: string, limit = 30): Promise<Recipe[]> {
    const supabase = createClient()
    const q = query.trim().toLowerCase()

    let req = supabase
        .from('recipes')
        .select(RECIPE_FIELDS)
        .order('name', { ascending: true })
        .limit(limit)

    if (q.length > 0) {
        req = req.ilike('search_text', `%${q}%`)
    }

    const { data, error } = await req
    if (error) {
        console.error('searchRecipes error:', error)
        return []
    }
    return (data ?? []) as Recipe[]
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('recipes')
        .select(RECIPE_FIELDS)
        .eq('id', id)
        .maybeSingle()
    if (error) {
        console.error('getRecipeById error:', error)
        return null
    }
    return (data as Recipe) ?? null
}

export async function getRecipeWithIngredients(id: string): Promise<RecipeWithIngredients | null> {
    const supabase = createClient()
    const { data: recipe, error: rErr } = await supabase
        .from('recipes')
        .select(RECIPE_FIELDS)
        .eq('id', id)
        .maybeSingle()
    if (rErr || !recipe) {
        if (rErr) console.error('getRecipe error:', rErr)
        return null
    }

    const { data: ingredients, error: iErr } = await supabase
        .from('recipe_ingredients')
        .select('id, recipe_id, food_id, grams, order_index, food:foods(*)')
        .eq('recipe_id', id)
        .order('order_index', { ascending: true })

    if (iErr) console.error('getRecipe ingredients error:', iErr)

    return {
        ...(recipe as Recipe),
        ingredients: (ingredients ?? []) as unknown as RecipeIngredient[],
    }
}

export interface CreateRecipeInput {
    name: string
    description?: string | null
    servings: number
    serving_label?: string | null
    is_public?: boolean
    ingredients: Array<{ food: Food; grams: number }>
}

function calculateRecipeTotals(ingredients: Array<{ food: Food; grams: number }>) {
    return ingredients.reduce(
        (acc, ing) => {
            const m = macrosForFood(ing.food, ing.grams)
            acc.kcal += m.kcal
            acc.protein_g += m.protein_g
            acc.carbs_g += m.carbs_g
            acc.fat_g += m.fat_g
            return acc
        },
        { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    )
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const totals = calculateRecipeTotals(input.ingredients)

    const { data: recipe, error } = await supabase
        .from('recipes')
        .insert({
            name: input.name.trim(),
            description: input.description ?? null,
            servings: input.servings,
            serving_label: input.serving_label ?? null,
            is_public: input.is_public ?? true,
            created_by: user.id,
            total_kcal: totals.kcal,
            total_protein_g: totals.protein_g,
            total_carbs_g: totals.carbs_g,
            total_fat_g: totals.fat_g,
        })
        .select(RECIPE_FIELDS)
        .single()

    if (error || !recipe) {
        console.error('createRecipe error:', error)
        return null
    }

    if (input.ingredients.length > 0) {
        const rows = input.ingredients.map((ing, idx) => ({
            recipe_id: recipe.id,
            food_id: ing.food.id,
            grams: ing.grams,
            order_index: idx,
        }))
        const { error: iErr } = await supabase.from('recipe_ingredients').insert(rows)
        if (iErr) console.error('insert recipe_ingredients error:', iErr)
    }

    return recipe as Recipe
}

export async function updateRecipe(id: string, input: CreateRecipeInput): Promise<Recipe | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const totals = calculateRecipeTotals(input.ingredients)

    const { data: recipe, error } = await supabase
        .from('recipes')
        .update({
            name: input.name.trim(),
            description: input.description ?? null,
            servings: input.servings,
            serving_label: input.serving_label ?? null,
            is_public: input.is_public ?? true,
            total_kcal: totals.kcal,
            total_protein_g: totals.protein_g,
            total_carbs_g: totals.carbs_g,
            total_fat_g: totals.fat_g,
        })
        .eq('id', id)
        .eq('created_by', user.id)
        .select(RECIPE_FIELDS)
        .single()

    if (error || !recipe) {
        console.error('updateRecipe error:', error)
        return null
    }

    const { error: deleteErr } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', id)

    if (deleteErr) {
        console.error('delete recipe ingredients error:', deleteErr)
        return null
    }

    if (input.ingredients.length > 0) {
        const rows = input.ingredients.map((ing, idx) => ({
            recipe_id: id,
            food_id: ing.food.id,
            grams: ing.grams,
            order_index: idx,
        }))
        const { error: insertErr } = await supabase.from('recipe_ingredients').insert(rows)
        if (insertErr) {
            console.error('insert updated recipe_ingredients error:', insertErr)
            return null
        }
    }

    return recipe as Recipe
}

export async function deleteRecipe(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No hay sesión activa' }

    const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id)
        .eq('created_by', user.id)

    if (error) {
        console.error('deleteRecipe error:', error)
        return {
            success: false,
            error: 'No se pudo eliminar. Si ya la usaste en registros antiguos, la dejamos guardada para no romper el histórico.',
        }
    }

    return { success: true }
}
