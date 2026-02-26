'use server'

import { createClient } from "@/lib/supabase/server";
import { UnifiedCalendarItem, ScheduledStrengthSession, CardioSession } from "@/types/planning";
import { CardioStructure } from "@/types/templates";

// ----------------------------------------------------------------------
// GET SCHEDULE
// ----------------------------------------------------------------------

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
        // Timezone-safe date formatter (avoids toISOString UTC shift)
        const toLocalDateStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const startStr = toLocalDateStr(startDate);
        const endStr = toLocalDateStr(endDate);

        // 1. Fetch ACTIVE training programs with their days (including default_weekday)
        // Fetch several because some might have no days configured
        const { data: programsArr, error: programError } = await supabase
            .from('training_programs')
            .select(`
                id,
                name,
                weeks,
                effective_from,
                training_days (
                    id,
                    name,
                    order_index,
                    default_weekday
                )
            `)
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(10);

        console.log('[getWeeklySchedule] Program query:',
            programError ? `ERROR: ${programError.message}` : `${(programsArr || []).length} programs found`);

        // Pick the most recent program that has at least one day with default_weekday set
        const activeProgram = (programsArr || []).find((p: any) =>
            p.training_days?.some((d: any) => d.default_weekday != null)
        ) || null;

        console.log('[getWeeklySchedule] Selected program:',
            activeProgram ? `${activeProgram.name} (${activeProgram.id})` : 'NONE');

        // 2. Generate virtual strength sessions from the active program
        const strengthItems: UnifiedCalendarItem[] = [];

        if (!programError && activeProgram && activeProgram.training_days) {
            const programStart = new Date(activeProgram.effective_from + 'T12:00:00'); // Noon to avoid timezone shift
            const totalWeeks = activeProgram.weeks || 4;

            console.log('[getWeeklySchedule] Active program:', activeProgram.name,
                'weeks:', totalWeeks, 'start:', activeProgram.effective_from,
                'days:', (activeProgram.training_days as any[]).map((d: any) => `${d.name}(weekday=${d.default_weekday})`));

            for (const day of activeProgram.training_days as any[]) {
                if (!day.default_weekday) continue; // Skip days without assigned weekday

                // default_weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun

                // For each week of the program, compute the session date
                for (let week = 0; week < totalWeeks; week++) {
                    // Start of this program week (Monday-based)
                    const weekStart = new Date(programStart);
                    weekStart.setDate(weekStart.getDate() + (week * 7));

                    // Find the Monday of this week
                    const mondayOffset = (weekStart.getDay() + 6) % 7; // Days since Monday
                    const monday = new Date(weekStart);
                    monday.setDate(monday.getDate() - mondayOffset);

                    // Set to the target weekday
                    const sessionDate = new Date(monday);
                    sessionDate.setDate(monday.getDate() + (day.default_weekday - 1)); // 1=Mon→+0, 2=Tue→+1, etc.

                    const sessionDateStr = toLocalDateStr(sessionDate);

                    // Only include if within the requested calendar range
                    if (sessionDateStr >= startStr && sessionDateStr <= endStr) {
                        strengthItems.push({
                            type: 'strength' as const,
                            id: `virtual-${activeProgram.id}-${day.id}-w${week}`,
                            client_id: clientId,
                            training_program_id: activeProgram.id,
                            training_day_id: day.id,
                            date: sessionDateStr,
                            is_completed: false,
                            created_at: new Date().toISOString(),
                            training_days: {
                                name: day.name,
                                order_index: day.order_index
                            },
                            training_programs: {
                                name: activeProgram.name
                            }
                        });
                    }
                }
            }

            console.log('[getWeeklySchedule] Generated', strengthItems.length, 'virtual strength sessions');
        }

        // 2b. Fetch REAL scheduled strength sessions from DB (manually added via dialog)
        const { data: realStrengthData, error: realStrengthError } = await supabase
            .from('scheduled_strength_sessions')
            .select(`
                id,
                client_id,
                coach_id,
                program_id,
                day_id,
                scheduled_date,
                is_completed,
                created_at
            `)
            .eq('client_id', clientId)
            .gte('scheduled_date', startStr)
            .lte('scheduled_date', endStr);

        if (realStrengthError) {
            console.error('[getWeeklySchedule] Real strength fetch error:', realStrengthError.message);
        }

        // Fetch day names and program names for real sessions
        const realStrengthItems: UnifiedCalendarItem[] = [];
        if (realStrengthData && realStrengthData.length > 0) {
            // Collect unique day_ids and program_ids to batch-fetch names
            const dayIds = [...new Set(realStrengthData.map((s: any) => s.day_id))];
            const programIds = [...new Set(realStrengthData.map((s: any) => s.program_id))];

            const { data: daysData } = await supabase
                .from('training_days')
                .select('id, name, order_index')
                .in('id', dayIds);

            const { data: programsData } = await supabase
                .from('training_programs')
                .select('id, name')
                .in('id', programIds);

            const daysMap = new Map((daysData || []).map((d: any) => [d.id, d]));
            const programsMap = new Map((programsData || []).map((p: any) => [p.id, p]));

            for (const s of realStrengthData as any[]) {
                const dayInfo = daysMap.get(s.day_id);
                const programInfo = programsMap.get(s.program_id);
                realStrengthItems.push({
                    type: 'strength' as const,
                    id: s.id,
                    client_id: s.client_id,
                    training_program_id: s.program_id,
                    training_day_id: s.day_id,
                    date: s.scheduled_date,
                    is_completed: s.is_completed,
                    created_at: s.created_at,
                    training_days: dayInfo ? { name: dayInfo.name, order_index: dayInfo.order_index } : { name: 'Día' },
                    training_programs: programInfo ? { name: programInfo.name } : { name: 'Programa' },
                });
            }
        }

        // Deduplicate: if a real scheduled session exists for the same day_id within this week, suppress the virtual
        const realDayIds = new Set(realStrengthItems.map(r => (r as any).training_day_id));
        const virtualDayIds = new Set(strengthItems.map(v => (v as any).training_day_id));
        const dedupedVirtual = strengthItems.filter(v => !realDayIds.has((v as any).training_day_id));

        // Mark real sessions that replaced a virtual (so UI keeps the auto/dashed style)
        for (const r of realStrengthItems) {
            if (virtualDayIds.has((r as any).training_day_id)) {
                (r as any).is_program_auto = true;
            }
        }

        const allStrengthItems = [...dedupedVirtual, ...realStrengthItems];

        // 3. Fetch Cardio Sessions (these are real DB rows, already working)
        const { data: cardioData, error: cardioError } = await supabase
            .from('cardio_sessions')
            .select(`
                id,
                client_id,
                coach_id,
                scheduled_date,
                name,
                description,
                notes,
                structure,
                is_completed,
                created_at
            `)
            .eq('client_id', clientId)
            .gte('scheduled_date', startStr)
            .lte('scheduled_date', endStr);

        if (cardioError) throw new Error(cardioError.message);

        // 4. Map Cardio → UnifiedCalendarItem
        const cardioItems: UnifiedCalendarItem[] = (cardioData || []).map((c: any) => ({
            type: 'cardio' as const,
            id: c.id,
            client_id: c.client_id,
            date: c.scheduled_date,
            name: c.name,
            description: c.description,
            notes: c.notes,
            structure: c.structure,
            is_completed: c.is_completed,
            created_at: c.created_at,
        }));

        // 5. Combine and sort by date
        const allItems = [...allStrengthItems, ...cardioItems].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        return { success: true, data: allItems };

    } catch (error: any) {
        console.error('[getWeeklySchedule] Error:', error);
        return { success: false, data: [], error: error.message };
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
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        // Resolve coach_id from clients table (required NOT NULL field)
        const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('coach_id')
            .eq('id', clientId)
            .single();

        if (clientError || !clientData?.coach_id) {
            throw new Error('No se pudo verificar el entrenador del cliente');
        }

        console.log('[scheduleStrengthSession] Resolved coach_id:', clientData.coach_id, 'for client:', clientId);

        const payload = {
            client_id: clientId,
            coach_id: clientData.coach_id,
            program_id: programId,
            day_id: dayId,
            scheduled_date: dateStr,
            is_completed: false
        };

        console.log('[scheduleStrengthSession] INSERT payload:', JSON.stringify(payload));

        const { error } = await supabase
            .from('scheduled_strength_sessions')
            .insert(payload);

        if (error) {
            console.error('[scheduleStrengthSession] INSERT ERROR:', error.code, error.message, error.details, error.hint);
            throw new Error(error.message);
        }

        console.log('[scheduleStrengthSession] INSERT SUCCESS');
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
    coachId: string;
    date: Date;
    name: string;
    description?: string;
    notes?: string;
    structure: CardioStructure;
}

export async function scheduleCardioSession({ clientId, coachId, date, name, description, notes, structure }: ScheduleCardioInput) {
    const supabase = await createClient();

    try {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        // structure.trainingType is needed for styling (colors/icons)
        const finalStructure = {
            trainingType: structure?.trainingType || 'rodaje'
        };

        // If notes were passed in structure (from deprecated form logic) but not as separate arg, use them.
        // But priority to the argument 'notes'
        const finalNotes = notes || structure?.notes;

        // Resolve coach_id from clients table
        // clients.coach_id → coaches.id (same FK target as cardio_sessions.coach_id after migration fix)
        const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('coach_id')
            .eq('id', clientId)
            .single();

        if (clientError || !clientData?.coach_id) {
            throw new Error('No se pudo verificar el entrenador del cliente');
        }

        const { error } = await supabase
            .from('cardio_sessions')
            .insert({
                client_id: clientId,
                coach_id: clientData.coach_id,
                scheduled_date: dateStr,
                name: name || 'Cardio',
                description: description || '',
                notes: finalNotes,
                structure: finalStructure,
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
                    order_index
                )
            `)
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(error.message);
        }

        const program = (data && data.length > 0) ? data[0] : null;

        if (!program) {
            return { success: true, data: null };
        }

        // Sort days by order_index
        if (program && program.training_days) {
            program.training_days.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
        }

        return { success: true, data: program };

    } catch (error: any) {
        console.error('Error fetching active program:', error);
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// DELETE CARDIO SESSION
// ----------------------------------------------------------------------

export async function deleteCardioSession(sessionId: string) {
    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from('cardio_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) {
            console.error('Error deleting cardio session:', error);
            throw new Error(error.message);
        }

        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// UPDATE CARDIO SESSION
// ----------------------------------------------------------------------

export async function updateCardioSession({
    id,
    name,
    description,
    structure
}: {
    id: string;
    name: string;
    description?: string;
    structure: CardioStructure
}) {
    const supabase = await createClient();

    try {
        const payload = {
            name,
            description,
            structure,
            notes: structure.notes || null
        };

        const { error } = await supabase
            .from('cardio_sessions')
            .update(payload)
            .eq('id', id);

        if (error) {
            console.error('Error updating cardio session:', error);
            throw new Error(error.message);
        }

        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// MOVE SESSION (Drag & Drop)
// ----------------------------------------------------------------------

export async function moveSession(
    sessionId: string,
    type: 'cardio' | 'strength',
    newDate: string // YYYY-MM-DD
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    try {
        const table = type === 'cardio' ? 'cardio_sessions' : 'scheduled_strength_sessions';
        const dateColumn = 'scheduled_date';

        const { error } = await supabase
            .from(table)
            .update({ [dateColumn]: newDate })
            .eq('id', sessionId);

        if (error) {
            console.error(`[moveSession] Error updating ${table}:`, error.message);
            throw new Error(error.message);
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// DELETE STRENGTH SESSION
// ----------------------------------------------------------------------

export async function deleteStrengthSession(
    sessionId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    try {
        const { error } = await supabase
            .from('scheduled_strength_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) {
            console.error('[deleteStrengthSession] Error:', error.message);
            throw new Error(error.message);
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// MATERIALIZE VIRTUAL SESSION (drag of auto session)
// ----------------------------------------------------------------------

export async function materializeVirtualSession(
    clientId: string,
    programId: string,
    dayId: string,
    scheduledDate: string // YYYY-MM-DD
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    try {
        // Resolve coach_id from clients table
        const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('coach_id')
            .eq('id', clientId)
            .single();

        if (clientError || !clientData?.coach_id) {
            throw new Error('No se pudo verificar el entrenador del cliente');
        }

        const { error } = await supabase
            .from('scheduled_strength_sessions')
            .insert({
                client_id: clientId,
                coach_id: clientData.coach_id,
                program_id: programId,
                day_id: dayId,
                scheduled_date: scheduledDate,
                is_completed: false,
            });

        if (error) {
            console.error('[materializeVirtualSession] INSERT Error:', error.message);
            throw new Error(error.message);
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
