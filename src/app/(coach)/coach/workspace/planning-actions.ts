'use server'

import { createClient } from "@/lib/supabase/server";
import { UnifiedCalendarItem, ScheduledStrengthSession, CardioSession } from "@/types/planning";
import { CardioStructure } from "@/types/templates";

// ----------------------------------------------------------------------
// GET SCHEDULE
// ----------------------------------------------------------------------

export async function getWeeklySchedule(
    clientId: string,
    startDate: Date,
    endDate: Date
): Promise<{ success: boolean; data?: UnifiedCalendarItem[]; error?: string }> {
    const supabase = await createClient();

    try {
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        // 1. Fetch Strength Sessions
        const strengthPromise = supabase
            .from('scheduled_strength_sessions')
            .select(`
                *,
                training_days ( name ),
                training_programs ( name )
            `)
            .eq('client_id', clientId)
            .gte('date', startStr)
            .lte('date', endStr);

        // 2. Fetch Cardio Sessions
        const cardioPromise = supabase
            .from('cardio_sessions')
            .select('*')
            .eq('client_id', clientId)
            .gte('date', startStr)
            .lte('date', endStr);

        const [strengthRes, cardioRes] = await Promise.all([strengthPromise, cardioPromise]);

        if (strengthRes.error) throw new Error(strengthRes.error.message);
        if (cardioRes.error) throw new Error(cardioRes.error.message);

        // 3. Map & Combine
        const strengthItems: UnifiedCalendarItem[] = (strengthRes.data || []).map((s: any) => ({
            type: 'strength',
            ...s
        }));

        const cardioItems: UnifiedCalendarItem[] = (cardioRes.data || []).map((c: any) => ({
            type: 'cardio',
            ...c
        }));

        const allItems = [...strengthItems, ...cardioItems].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        return { success: true, data: allItems };

    } catch (error: any) {
        console.error('Error fetching schedule:', error);
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// SCHEDULE STRENGTH
// ----------------------------------------------------------------------

type ScheduleStrengthInput = {
    clientId: string;
    programId: string;
    dayId: string;
    date: Date;
}

export async function scheduleStrengthSession({ clientId, programId, dayId, date }: ScheduleStrengthInput) {
    const supabase = await createClient();

    try {
        const dateStr = date.toISOString().split('T')[0];

        const { error } = await supabase
            .from('scheduled_strength_sessions')
            .insert({
                client_id: clientId,
                training_program_id: programId,
                training_day_id: dayId,
                date: dateStr,
                is_completed: false
            });

        if (error) throw new Error(error.message);
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// SCHEDULE CARDIO
// ----------------------------------------------------------------------

type ScheduleCardioInput = {
    clientId: string;
    date: Date;
    name: string;
    description?: string;
    structure: CardioStructure;
}

export async function scheduleCardioSession({ clientId, date, name, description, structure }: ScheduleCardioInput) {
    const supabase = await createClient();

    try {
        const dateStr = date.toISOString().split('T')[0];

        const { error } = await supabase
            .from('cardio_sessions')
            .insert({
                client_id: clientId,
                date: dateStr,
                name,
                description,
                structure,
                is_completed: false
            });

        if (error) throw new Error(error.message);
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// GET ACTIVE PROGRAM
// ----------------------------------------------------------------------

export async function getActiveProgram(clientId: string) {
    const supabase = await createClient();

    try {
        // Fetch the most recent active program
        const { data, error } = await supabase
            .from('training_programs')
            .select(`
                id,
                name,
                training_days (
                    id,
                    name,
                    order
                )
            `)
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('effective_from', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            // It's possible there is no active program, which isn't necessarily an error for the UI
            if (error.code === 'PGRST116') {
                return { success: true, data: null };
            }
            throw new Error(error.message);
        }

        // Sort days by order
        if (data && data.training_days) {
            data.training_days.sort((a: any, b: any) => a.order - b.order);
        }

        return { success: true, data };

    } catch (error: any) {
        console.error('Error fetching active program:', error);
        return { success: false, error: error.message };
    }
}
