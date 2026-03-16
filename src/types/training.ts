// Training data types for the client portal

export interface TrainingProgram {
  id: string;
  name: string;
  totalWeeks: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface TrainingDay {
  id: string;
  name: string;
  order: number;
  default_weekday?: number; // 1=Mon, 7=Sun
}

export interface TrainingColumn {
  id: string;
  key?: string; // Add key for frontend logic
  label: string;
  type: 'text' | 'number' | 'time' | 'textarea';
  scope: 'exercise' | 'week'; // exercise = same for all weeks, week = per week
  editable: boolean; // true = client can edit, false = coach defined
  order: number;
}

export interface TrainingExercise {
  id: string;
  dayId: string;
  name: string;
  order: number;
  sets?: number;
  reps?: string;
  rir?: string;
  restSeconds?: number;
  notes?: string;
}

export interface TrainingCell {
  id: string;
  exerciseId: string;
  columnId: string;
  weekNumber: number;
  value: any; // Allow objects or strings
}

export interface ExerciseSet {
  id: string;
  exerciseId: string;
  weekNumber: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
  isOverride: boolean;
  notes: string | null;
}

export interface TrainingProgramFull {
  program: TrainingProgram;
  days: TrainingDay[];
  columns: TrainingColumn[];
  exercises: TrainingExercise[];
  cells: TrainingCell[];
  sets: ExerciseSet[];
}

export interface CellSaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved?: Date;
}

// Diet types
export interface MacroPlan {
  id: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  stepsGoal?: number;
  cardioGoal?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  day_type_config?: {
    training: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
    rest: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  } | null;
}

export interface MealOption {
  id: string;
  name: string;
  foods: string[];
  tips?: string;
  coachNote?: string;
}

export interface MealTime {
  id: string;
  name: string; // Desayuno, Comida, etc.
  options: MealOption[];
}

export interface DietPlan {
  id: string;
  meals: MealTime[];
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface DailyAdherence {
  id: string;
  date: string;
  adherencePercent: number;
  notes?: string;
}

// Daily metrics
export interface DailyMetrics {
  id: string;
  date: string;
  weight?: number;
  steps?: number;
  sleepHours?: number;
  notes?: string;
}

// Profile
export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  coachName: string;
  goal: string;
  avatarUrl?: string;
}
