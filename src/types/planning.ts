import { TrainingProgram } from "./training";
import { CardioStructure } from "./templates";

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
    } | null;
    training_programs?: {
        name: string;
    } | null;
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
}

export type UnifiedCalendarItem =
    | ({ type: 'strength' } & ScheduledStrengthSession)
    | ({ type: 'cardio' } & CardioSession);
