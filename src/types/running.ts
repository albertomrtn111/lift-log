// Running training types

export type SessionType = 'easy' | 'intervals' | 'tempo' | 'long' | 'recovery' | 'rest';
export type IntensityZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

export interface SessionBlock {
  id: string;
  name: string; // "Calentamiento", "Principal", "Enfriamiento"
  description: string;
}

export interface RunningSession {
  id: string;
  date: string;
  weekNumber: number;
  dayOfWeek: number; // 0-6 (0 = Sunday)
  name: string;
  type: SessionType;
  targetDistance?: number; // km
  targetDuration?: number; // minutos
  targetZone?: IntensityZone;
  targetRPE?: number;
  structure?: SessionBlock[];
  coachNotes?: string;
  isCompleted: boolean;
}

export interface SessionLog {
  id: string;
  sessionId: string;
  actualDistance?: number;
  actualDuration?: number; // minutos
  averagePace?: string; // "5:30 min/km"
  rpe?: number; // 1-10
  notes?: string;
  completedAt: string;
}

export interface WeeklySummary {
  weekNumber: number;
  plannedDistance: number;
  completedDistance: number;
  plannedSessions: number;
  completedSessions: number;
}

// Backfill types
export interface BackfillEntry {
  date: string;
  isComplete: boolean;
  isPartial: boolean;
}

export interface ProgressBackfillData {
  date: string;
  weight?: number;
  steps?: number;
  sleepHours?: number;
  notes?: string;
}

export interface DietBackfillData {
  date: string;
  adherencePercent?: number;
  notes?: string;
}
