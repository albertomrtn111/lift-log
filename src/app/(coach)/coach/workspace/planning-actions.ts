'use server'

import { createClient } from "@/lib/supabase/server";
import { UnifiedCalendarItem, PlanningSnapshot, PlanningNote, PlanningDayState } from "@/types/planning";
import { CardioStructure } from "@/types/templates";
import { requireActiveCoachId } from "@/lib/auth/require-coach";

type TrainingDayRow = {
    id: string;
    name: string;
    order_index?: number | null;
    default_weekday?: number | null;
}

type ActiveProgramRow = {
    id: string;
    name: string;
    weeks?: number | null;
    effective_from: string;
    training_days?: TrainingDayRow[] | null;
}

type CalendarNoteRow = {
    id: string;
    note_date: string;
    kind: PlanningNote['kind'];
    content: string;
}

function toLocalDateStr(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseLocalDate(value: string) {
    return new Date(`${value}T12:00:00`);
}

function startOfLocalWeek(value: Date) {
    const result = new Date(value);
    const mondayOffset = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - mondayOffset);
    return result;
}

function eachDateBetween(startDate: Date, endDate: Date) {
    const days: Date[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

function getProgramWeekForDate(date: Date, effectiveFrom: string, totalWeeks: number) {
    const programStart = startOfLocalWeek(parseLocalDate(effectiveFrom));
    const targetWeek = startOfLocalWeek(date);
    const diffMs = targetWeek.getTime() - programStart.getTime();
    const weekIndex = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)) + 1;
    if (weekIndex < 1 || weekIndex > totalWeeks) return null;
    return weekIndex;
}

function derivePhaseLabel(currentWeek: number | null, totalWeeks: number | null) {
    if (!currentWeek || !totalWeeks) return null;
    if (totalWeeks === 1) return 'Semana única';
    if (currentWeek === 1) return 'Inicio del bloque';
    if (currentWeek === totalWeeks) return 'Cierre del bloque';
    if (currentWeek === totalWeeks - 1) return 'Consolidación';
    if (currentWeek <= Math.max(2, Math.ceil(totalWeeks * 0.33))) return 'Construcción';
    if (currentWeek >= Math.ceil(totalWeeks * 0.66)) return 'Afinado';
    return 'Desarrollo';
}

function deriveWeeklyObjective(strengthSessions: number, cardioSessions: number) {
    if (strengthSessions === 0 && cardioSessions === 0) return 'Semana sin sesiones programadas';
    if (strengthSessions > 0 && cardioSessions > 0) return 'Microciclo híbrido con trabajo de fuerza y cardio';
    if (strengthSessions > cardioSessions) return 'Microciclo orientado a fuerza';
    if (cardioSessions > strengthSessions) return 'Microciclo orientado a resistencia';
    return 'Semana equilibrada';
}

function deriveStrengthFocus(dayName: string | null | undefined, exerciseNames: string[]) {
    const normalized = `${dayName ?? ''} ${exerciseNames.join(' ')}`.toLowerCase();

    if (/(full[\s-]?body|fullbody|cuerpo completo)/.test(normalized)) return 'Full body';
    if (/(torso|upper)/.test(normalized)) return 'Torso';
    if (/(pierna|leg|lower|tren inferior)/.test(normalized)) return 'Pierna';
    if (/(empuje|push|pecho|hombro|tr[ií]ceps)/.test(normalized)) return 'Empuje';
    if (/(tir[oó]n|pull|espalda|b[ií]ceps)/.test(normalized)) return 'Tirón';
    if (/(gl[uú]teo|glute|posterior|femoral)/.test(normalized)) return 'Posterior';
    if (/(core|abdomen|abs)/.test(normalized)) return 'Core';

    return 'General';
}

function getCardioSummaryLine(cardio: any) {
    const parts: string[] = [];
    let distance = cardio.target_distance_km ? Number(cardio.target_distance_km) : undefined;
    let duration = cardio.target_duration_min ? Number(cardio.target_duration_min) : undefined;

    if ((!distance || !duration) && cardio.structure?.blocks) {
        const continuousBlock = cardio.structure.blocks.find((block: any) => block.type === 'continuous');
        if (continuousBlock) {
            if (!distance && continuousBlock.distance) distance = Number(continuousBlock.distance);
            if (!duration && continuousBlock.duration) duration = Number(continuousBlock.duration);
        }
    }

    if (distance) parts.push(`${distance} km`);
    if (duration) parts.push(`${duration} min`);
    if (cardio.target_pace) parts.push(cardio.target_pace);
    return parts.join(' · ');
}

// ----------------------------------------------------------------------
// GET SCHEDULE
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// GET SCHEDULE
// ----------------------------------------------------------------------

export async function getWeeklySchedule(
    clientId: string,
    startDate: Date,
    endDate: Date,
    anchorDate: Date = startDate
): Promise<{ success: boolean; data?: PlanningSnapshot; error?: string }> {
    const supabase = await createClient();

    try {
        const startStr = toLocalDateStr(startDate);
        const endStr = toLocalDateStr(endDate);

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

        const activeProgram = ((programsArr || []) as ActiveProgramRow[]).find((p) =>
            p.training_days?.some((d: any) => d.default_weekday != null)
        ) || null;

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

        if (realStrengthError) throw new Error(realStrengthError.message);

        const uniqueDayIds = new Set<string>();
        const uniqueProgramIds = new Set<string>();

        for (const day of activeProgram?.training_days || []) {
            uniqueDayIds.add(day.id);
            uniqueProgramIds.add(activeProgram!.id);
        }

        for (const session of (realStrengthData || []) as any[]) {
            uniqueDayIds.add(session.day_id);
            uniqueProgramIds.add(session.program_id);
        }

        const dayIds = Array.from(uniqueDayIds);
        const programIds = Array.from(uniqueProgramIds);

        const [{ data: daysData }, { data: programsData }, { data: exerciseRows }] = await Promise.all([
            dayIds.length > 0
                ? supabase.from('training_days').select('id, name, order_index, default_weekday').in('id', dayIds)
                : Promise.resolve({ data: [] as any[] }),
            programIds.length > 0
                ? supabase.from('training_programs').select('id, name').in('id', programIds)
                : Promise.resolve({ data: [] as any[] }),
            dayIds.length > 0
                ? supabase.from('training_exercises').select('day_id, exercise_name').in('day_id', dayIds)
                : Promise.resolve({ data: [] as any[] }),
        ]);

        const daysMap = new Map((daysData || []).map((d: any) => [d.id, d]));
        const programsMap = new Map((programsData || []).map((p: any) => [p.id, p]));
        const exercisesByDayId = new Map<string, string[]>();
        for (const exercise of (exerciseRows || []) as any[]) {
            const list = exercisesByDayId.get(exercise.day_id) || [];
            if (exercise.exercise_name) list.push(exercise.exercise_name);
            exercisesByDayId.set(exercise.day_id, list);
        }

        const virtualStrengthItems: UnifiedCalendarItem[] = [];
        const totalWeeks = activeProgram?.weeks || 4;
        if (!programError && activeProgram && activeProgram.training_days) {
            for (const day of activeProgram.training_days) {
                if (!day.default_weekday) continue;

                for (let week = 0; week < totalWeeks; week++) {
                    const baseWeekDate = parseLocalDate(activeProgram.effective_from);
                    baseWeekDate.setDate(baseWeekDate.getDate() + (week * 7));
                    const monday = startOfLocalWeek(baseWeekDate);
                    const sessionDate = new Date(monday);
                    sessionDate.setDate(monday.getDate() + ((day.default_weekday || 1) - 1));
                    const sessionDateStr = toLocalDateStr(sessionDate);

                    if (sessionDateStr < startStr || sessionDateStr > endStr) continue;

                    const exerciseNames = exercisesByDayId.get(day.id) || [];
                    virtualStrengthItems.push({
                        type: 'strength',
                        id: `virtual-${activeProgram.id}-${day.id}-w${week}`,
                        client_id: clientId,
                        training_program_id: activeProgram.id,
                        training_day_id: day.id,
                        date: sessionDateStr,
                        is_completed: false,
                        created_at: new Date().toISOString(),
                        training_days: {
                            name: day.name,
                            order_index: day.order_index ?? undefined,
                        },
                        training_programs: {
                            name: activeProgram.name,
                        },
                        exercise_count: exerciseNames.length,
                        focus_label: deriveStrengthFocus(day.name, exerciseNames),
                        source_kind: 'program_auto',
                        source_label: 'Programa',
                        week_index: week + 1,
                        is_program_auto: true,
                    });
                }
            }
        }

        const realStrengthItems: UnifiedCalendarItem[] = ((realStrengthData || []) as any[]).map((session) => {
            const dayInfo = daysMap.get(session.day_id);
            const programInfo = programsMap.get(session.program_id);
            const exerciseNames = exercisesByDayId.get(session.day_id) || [];
            const replacedVirtual = virtualStrengthItems.some((virtualItem) => (
                virtualItem.type === 'strength' &&
                virtualItem.training_day_id === session.day_id
            ));

            return {
                type: 'strength',
                id: session.id,
                client_id: session.client_id,
                training_program_id: session.program_id,
                training_day_id: session.day_id,
                date: session.scheduled_date,
                is_completed: session.is_completed,
                created_at: session.created_at,
                training_days: dayInfo
                    ? { name: dayInfo.name, order_index: dayInfo.order_index ?? undefined }
                    : { name: 'Día' },
                training_programs: programInfo ? { name: programInfo.name } : { name: 'Programa' },
                exercise_count: exerciseNames.length,
                focus_label: deriveStrengthFocus(dayInfo?.name, exerciseNames),
                source_kind: replacedVirtual ? 'adjusted' : 'manual',
                source_label: replacedVirtual ? 'Ajustada' : 'Manual',
                week_index: activeProgram?.effective_from
                    ? getProgramWeekForDate(parseLocalDate(session.scheduled_date), activeProgram.effective_from, totalWeeks)
                    : null,
                is_program_auto: replacedVirtual,
            };
        });

        const realDayIds = new Set(
            realStrengthItems
                .filter((item) => item.type === 'strength')
                .map((item) => item.training_day_id)
        );
        const dedupedVirtual = virtualStrengthItems.filter(
            (item) => item.type === 'strength' && !realDayIds.has(item.training_day_id)
        );
        const allStrengthItems = [...dedupedVirtual, ...realStrengthItems];

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
                created_at,
                target_distance_km,
                target_duration_min,
                target_pace
            `)
            .eq('client_id', clientId)
            .gte('scheduled_date', startStr)
            .lte('scheduled_date', endStr);

        if (cardioError) throw new Error(cardioError.message);

        const cardioItems: UnifiedCalendarItem[] = (cardioData || []).map((c: any) => ({
            type: 'cardio',
            id: c.id,
            client_id: c.client_id,
            date: c.scheduled_date,
            name: c.name,
            description: c.description,
            notes: c.notes,
            structure: c.structure,
            is_completed: c.is_completed,
            created_at: c.created_at,
            target_distance_km: c.target_distance_km ? Number(c.target_distance_km) : undefined,
            target_duration_min: c.target_duration_min ? Number(c.target_duration_min) : undefined,
            target_pace: c.target_pace || undefined,
            cardio_type: c.structure?.trainingType || 'rodaje',
            summary_line: getCardioSummaryLine(c),
        }));

        const allItems = [...allStrengthItems, ...cardioItems].sort((a, b) =>
            a.date.localeCompare(b.date) || a.type.localeCompare(b.type)
        );

        let notesEnabled = true;
        let planningNotes: PlanningNote[] = [];

        const { data: noteRows, error: noteError } = await supabase
            .from('calendar_notes')
            .select('id, note_date, kind, content')
            .eq('client_id', clientId)
            .gte('note_date', startStr)
            .lte('note_date', endStr)
            .order('note_date', { ascending: true });

        if (noteError) {
            notesEnabled = false;
        } else {
            planningNotes = ((noteRows || []) as CalendarNoteRow[]).map((note) => ({
                id: note.id,
                date: note.note_date,
                kind: note.kind,
                content: note.content,
            }));
        }

        const notesByDate = new Map<string, PlanningNote[]>();
        for (const note of planningNotes) {
            const list = notesByDate.get(note.date) || [];
            list.push(note);
            notesByDate.set(note.date, list);
        }

        const itemsByDate = new Map<string, UnifiedCalendarItem[]>();
        for (const item of allItems) {
            const list = itemsByDate.get(item.date) || [];
            list.push(item);
            itemsByDate.set(item.date, list);
        }

        const dayContexts = eachDateBetween(startDate, endDate).map((date) => {
            const dateStr = toLocalDateStr(date);
            const dayItems = itemsByDate.get(dateStr) || [];
            const dayNotes = notesByDate.get(dateStr) || [];
            const state: PlanningDayState = dayItems.length > 0 ? 'scheduled' : 'empty';

            return {
                date: dateStr,
                state,
                noteCount: dayNotes.length,
                notes: dayNotes,
            };
        });

        const anchorWeek = activeProgram?.effective_from
            ? getProgramWeekForDate(anchorDate, activeProgram.effective_from, totalWeeks)
            : null;
        const plannedRestDays = 0;
        const emptyDays = dayContexts.filter((day) => day.state === 'empty').length;
        const strengthSessions = allItems.filter((item) => item.type === 'strength').length;
        const cardioSessions = allItems.filter((item) => item.type === 'cardio').length;

        return {
            success: true,
            data: {
                items: allItems,
                overview: {
                    programId: activeProgram?.id || null,
                    programName: activeProgram?.name || null,
                    currentWeek: anchorWeek,
                    totalWeeks: activeProgram ? totalWeeks : null,
                    phaseLabel: derivePhaseLabel(anchorWeek, activeProgram ? totalWeeks : null),
                    weeklyObjective: deriveWeeklyObjective(strengthSessions, cardioSessions),
                    strengthSessions,
                    cardioSessions,
                    plannedRestDays,
                    emptyDays,
                },
                dayContexts,
                notesEnabled,
            },
        };

    } catch (error: any) {
        console.error('[getWeeklySchedule] Error:', error);
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
    date: string; // YYYY-MM-DD
}

export async function scheduleStrengthSession({ clientId, programId, dayId, date }: ScheduleStrengthInput) {
    // Validate coach has active membership
    const { supabase } = await requireActiveCoachId();

    try {
        const dateStr = date;

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
    date: string; // YYYY-MM-DD
    name: string;
    description?: string;
    notes?: string;
    structure: CardioStructure;
    targetDistanceKm?: number;
    targetDurationMin?: number;
    targetPace?: string;
}

export async function scheduleCardioSession({ clientId, coachId, date, name, description, notes, structure, targetDistanceKm, targetDurationMin, targetPace }: ScheduleCardioInput) {
    // Validate coach has active membership
    const { supabase } = await requireActiveCoachId(coachId);

    try {
        const dateStr = date;

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
                is_completed: false,
                target_distance_km: targetDistanceKm ?? null,
                target_duration_min: targetDurationMin ?? null,
                target_pace: targetPace || null,
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
    structure,
    targetDistanceKm,
    targetDurationMin,
    targetPace,
}: {
    id: string;
    name: string;
    description?: string;
    structure: CardioStructure;
    targetDistanceKm?: number;
    targetDurationMin?: number;
    targetPace?: string;
}) {
    const supabase = await createClient();

    try {
        const payload = {
            name,
            description,
            structure,
            notes: structure.notes || null,
            target_distance_km: targetDistanceKm ?? null,
            target_duration_min: targetDurationMin ?? null,
            target_pace: targetPace || null,
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
// DUPLICATE STRENGTH SESSION
// ----------------------------------------------------------------------

export async function duplicateStrengthSession(
    sessionId: string
): Promise<{ success: boolean; newId?: string; error?: string }> {
    const supabase = await createClient();

    try {
        // 1. Read original
        const { data: original, error: readError } = await supabase
            .from('scheduled_strength_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (readError || !original) {
            throw new Error('Sesión de fuerza no encontrada');
        }

        // 2. Insert clone (same date, same program/day, not completed)
        const { data: clone, error: insertError } = await supabase
            .from('scheduled_strength_sessions')
            .insert({
                client_id: original.client_id,
                coach_id: original.coach_id,
                program_id: original.program_id,
                day_id: original.day_id,
                scheduled_date: original.scheduled_date, // keep exact date string
                is_completed: false,
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('[duplicateStrengthSession] Error:', insertError.message);
            throw new Error(insertError.message);
        }

        return { success: true, newId: clone?.id };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ----------------------------------------------------------------------
// DUPLICATE CARDIO SESSION
// ----------------------------------------------------------------------

export async function duplicateCardioSession(
    sessionId: string
): Promise<{ success: boolean; newId?: string; error?: string }> {
    const supabase = await createClient();

    try {
        // 1. Read original
        const { data: original, error: readError } = await supabase
            .from('cardio_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (readError || !original) {
            throw new Error('Sesión de cardio no encontrada');
        }

        // 2. Insert clone with "(copia)" suffix
        const { data: clone, error: insertError } = await supabase
            .from('cardio_sessions')
            .insert({
                client_id: original.client_id,
                coach_id: original.coach_id,
                scheduled_date: original.scheduled_date, // keep exact date string
                name: `${original.name || 'Cardio'} (copia)`,
                description: original.description,
                notes: original.notes,
                structure: original.structure,
                is_completed: false,
                target_distance_km: original.target_distance_km,
                target_duration_min: original.target_duration_min,
                target_pace: original.target_pace,
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('[duplicateCardioSession] Error:', insertError.message);
            throw new Error(insertError.message);
        }

        return { success: true, newId: clone?.id };
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
    // Validate coach has active membership
    const { supabase } = await requireActiveCoachId();

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
