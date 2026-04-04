import { TrainingProgram } from "./training";
import { CardioStructure } from "./templates";

export type PlanningDayState = 'scheduled' | 'planned_rest' | 'empty';
export type StrengthSessionSourceKind = 'program_auto' | 'adjusted' | 'manual';

export interface PlanningNote {
    id: string;
    date: string;
    kind: 'note' | 'reminder' | 'alert';
    content: string;
}

export interface ScheduledStrengthSession {
    id: string; // uuid
    client_id: string; // uuid
    training_program_id: string; // uuid
    training_day_id: string; // uuid
    date: string; // YYYY-MM-DD
    is_completed: boolean;
    created_at: string;

    // Relations (joined)
    training_days?: {
        name: string;
        order_index?: number;
    } | null;
    training_programs?: {
        name: string;
    } | null;
    exercise_count?: number;
    focus_label?: string | null;
    source_kind?: StrengthSessionSourceKind;
    source_label?: string | null;
    week_index?: number | null;
    is_program_auto?: boolean;
}

export interface CardioSession {
    id: string; // uuid
    client_id: string; // uuid
    date: string; // YYYY-MM-DD
    name: string;
    description?: string;
    structure: CardioStructure;
    is_completed: boolean;
    created_at: string;
    rpe?: number;
    duration_minutes?: number;
    distance_km?: number;
    notes?: string;
    target_distance_km?: number;
    target_duration_min?: number;
    target_pace?: string;
    cardio_type?: string;
    summary_line?: string;
}

export type UnifiedCalendarItem =
    | ({ type: 'strength' } & ScheduledStrengthSession)
    | ({ type: 'cardio' } & CardioSession);

export interface PlanningDayContext {
    date: string;
    state: PlanningDayState;
    noteCount: number;
    notes: PlanningNote[];
}

export interface PlanningOverview {
    programId: string | null;
    programName: string | null;
    currentWeek: number | null;
    totalWeeks: number | null;
    phaseLabel: string | null;
    weeklyObjective: string | null;
    strengthSessions: number;
    cardioSessions: number;
    plannedRestDays: number;
    emptyDays: number;
}

export interface PlanningSnapshot {
    items: UnifiedCalendarItem[];
    overview: PlanningOverview;
    dayContexts: PlanningDayContext[];
    notesEnabled: boolean;
}
