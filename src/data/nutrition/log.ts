import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { NutritionLogEntry, NutritionLogEntryInput, DayType } from './tracking-types'

const ENTRY_FIELDS = 'id, client_id, log_date, meal_type, meal_label, meal_order, food_id, recipe_id, quantity_g, servings, kcal, protein_g, carbs_g, fat_g, item_name, day_type, notes, created_at, updated_at'
const MEAL_SLOT_FIELDS = 'id, client_id, label, order_index, effective_from, deleted_from, created_at, updated_at'

export interface NutritionMealSlot {
    id: string
    client_id: string
    label: string
    order_index: number
    effective_from: string
    deleted_from: string | null
    created_at: string
    updated_at: string
}

async function getCurrentClientId(): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()
    return client?.id ?? null
}

export async function getNutritionLogForDate(date: Date): Promise<NutritionLogEntry[]> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return []

    const dateStr = format(date, 'yyyy-MM-dd')
    const { data, error } = await supabase
        .from('nutrition_log_entries')
        .select(ENTRY_FIELDS)
        .eq('client_id', clientId)
        .eq('log_date', dateStr)
        .order('meal_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        console.error('getNutritionLogForDate error:', error)
        return []
    }
    return (data ?? []) as NutritionLogEntry[]
}

export async function addNutritionLogEntry(input: NutritionLogEntryInput): Promise<NutritionLogEntry | null> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return null

    const { data, error } = await supabase
        .from('nutrition_log_entries')
        .insert({
            client_id: clientId,
            ...input,
        })
        .select(ENTRY_FIELDS)
        .single()

    if (error) {
        console.error('addNutritionLogEntry error:', error)
        return null
    }
    return data as NutritionLogEntry
}

export async function addNutritionLogEntriesBatch(inputs: NutritionLogEntryInput[]): Promise<NutritionLogEntry[]> {
    if (inputs.length === 0) return []

    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return []

    const { data, error } = await supabase
        .from('nutrition_log_entries')
        .insert(inputs.map(input => ({
            client_id: clientId,
            ...input,
        })))
        .select(ENTRY_FIELDS)

    if (error) {
        console.error('addNutritionLogEntriesBatch error:', error)
        return []
    }
    return (data ?? []) as NutritionLogEntry[]
}

export async function updateNutritionLogEntry(
    id: string,
    patch: Partial<NutritionLogEntryInput>
): Promise<NutritionLogEntry | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('nutrition_log_entries')
        .update(patch)
        .eq('id', id)
        .select(ENTRY_FIELDS)
        .single()
    if (error) {
        console.error('updateNutritionLogEntry error:', error)
        return null
    }
    return data as NutritionLogEntry
}

export async function deleteNutritionLogEntry(id: string): Promise<boolean> {
    const supabase = createClient()
    const { error } = await supabase
        .from('nutrition_log_entries')
        .delete()
        .eq('id', id)
    if (error) {
        console.error('deleteNutritionLogEntry error:', error)
        return false
    }
    return true
}

/** Lee el day_type elegido por el cliente para una fecha (si existe). */
export async function getDayTypeForDate(date: Date): Promise<DayType | null> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return null

    const dateStr = format(date, 'yyyy-MM-dd')
    const { data, error } = await supabase
        .from('nutrition_day_settings')
        .select('day_type')
        .eq('client_id', clientId)
        .eq('log_date', dateStr)
        .maybeSingle()
    if (error) {
        console.error('getDayTypeForDate error:', error)
        return null
    }
    return (data?.day_type as DayType) ?? null
}

/**
 * Persiste el day_type para una fecha: upsert en nutrition_day_settings y
 * actualiza el snapshot en todas las entradas existentes de ese día.
 */
export async function setDayTypeForDate(date: Date, dayType: DayType): Promise<boolean> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return false

    const dateStr = format(date, 'yyyy-MM-dd')

    const { error: upsertErr } = await supabase
        .from('nutrition_day_settings')
        .upsert(
            { client_id: clientId, log_date: dateStr, day_type: dayType },
            { onConflict: 'client_id,log_date' }
        )
    if (upsertErr) {
        console.error('setDayTypeForDate upsert error:', upsertErr)
        return false
    }

    const { error: updErr } = await supabase
        .from('nutrition_log_entries')
        .update({ day_type: dayType })
        .eq('client_id', clientId)
        .eq('log_date', dateStr)
    if (updErr) {
        console.error('setDayTypeForDate update entries error:', updErr)
    }

    return true
}

export async function getNutritionMealSlotsForDate(date: Date): Promise<NutritionMealSlot[]> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return []

    const dateStr = format(date, 'yyyy-MM-dd')
    const { data, error } = await supabase
        .from('nutrition_meal_slots')
        .select(MEAL_SLOT_FIELDS)
        .eq('client_id', clientId)
        .lte('effective_from', dateStr)
        .or(`deleted_from.is.null,deleted_from.gt.${dateStr}`)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        console.warn('getNutritionMealSlotsForDate error:', error)
        return []
    }
    return (data ?? []) as NutritionMealSlot[]
}

export async function createNutritionMealSlot(label: string, orderIndex: number, effectiveFrom: Date): Promise<NutritionMealSlot | null> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return null

    const { data, error } = await supabase
        .from('nutrition_meal_slots')
        .insert({
            client_id: clientId,
            label: label.trim(),
            order_index: orderIndex,
            effective_from: format(effectiveFrom, 'yyyy-MM-dd'),
        })
        .select(MEAL_SLOT_FIELDS)
        .single()

    if (error) {
        console.error('createNutritionMealSlot error:', error)
        return null
    }
    return data as NutritionMealSlot
}

export async function deleteNutritionMealSlot(slotId: string, deletedFrom: Date): Promise<boolean> {
    const supabase = createClient()
    const clientId = await getCurrentClientId()
    if (!clientId) return false

    const { error } = await supabase
        .from('nutrition_meal_slots')
        .update({ deleted_from: format(deletedFrom, 'yyyy-MM-dd') })
        .eq('id', slotId)
        .eq('client_id', clientId)

    if (error) {
        console.error('deleteNutritionMealSlot error:', error)
        return false
    }
    return true
}
