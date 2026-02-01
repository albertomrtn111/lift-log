import { RunningSession, SessionLog, WeeklySummary } from '@/types/running';
import { subDays, format, addDays, startOfWeek } from 'date-fns';

// Generate dates for current week
const today = new Date();
const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday

export const mockRunningSessions: RunningSession[] = [
  {
    id: 'rs1',
    date: format(weekStart, 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 1,
    name: 'Rodaje Z2',
    type: 'easy',
    targetDistance: 8,
    targetZone: 'Z2',
    coachNotes: 'Ritmo conversacional, sin forzar. Mantén las pulsaciones por debajo de 145.',
    isCompleted: true,
  },
  {
    id: 'rs2',
    date: format(addDays(weekStart, 1), 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 2,
    name: 'Series 6×1km',
    type: 'intervals',
    targetDistance: 10,
    targetZone: 'Z4',
    structure: [
      { id: 'b1', name: 'Calentamiento', description: "10' Z1-Z2" },
      { id: 'b2', name: 'Principal', description: "6×1km ritmo 10K, rec 2'" },
      { id: 'b3', name: 'Enfriamiento', description: "10' suave" },
    ],
    coachNotes: 'Controla el primer km, acelera al final si te encuentras bien. Recuperación activa trotando.',
    isCompleted: false,
  },
  {
    id: 'rs3',
    date: format(addDays(weekStart, 2), 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 3,
    name: 'Descanso',
    type: 'rest',
    isCompleted: false,
  },
  {
    id: 'rs4',
    date: format(addDays(weekStart, 3), 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 4,
    name: 'Tempo',
    type: 'tempo',
    targetDistance: 6,
    targetDuration: 30,
    targetZone: 'Z3',
    structure: [
      { id: 'b4', name: 'Calentamiento', description: "10' suave" },
      { id: 'b5', name: 'Principal', description: "20' ritmo umbral (Z3)" },
      { id: 'b6', name: 'Enfriamiento', description: "5' trote" },
    ],
    coachNotes: 'Mantén un ritmo incómodo pero sostenible. No empieces demasiado rápido.',
    isCompleted: false,
  },
  {
    id: 'rs5',
    date: format(addDays(weekStart, 4), 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 5,
    name: 'Rodaje suave',
    type: 'recovery',
    targetDistance: 6,
    targetZone: 'Z1',
    coachNotes: 'Recuperación activa. Ritmo muy suave, regenerativo.',
    isCompleted: false,
  },
  {
    id: 'rs6',
    date: format(addDays(weekStart, 5), 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 6,
    name: 'Tirada larga',
    type: 'long',
    targetDistance: 16,
    targetDuration: 90,
    targetZone: 'Z2',
    structure: [
      { id: 'b7', name: 'Principal', description: "90' progresivo Z1→Z2" },
    ],
    coachNotes: 'Empieza muy tranquilo. Los últimos 20 minutos puedes subir un poco el ritmo si te sientes bien.',
    isCompleted: false,
  },
  {
    id: 'rs7',
    date: format(addDays(weekStart, 6), 'yyyy-MM-dd'),
    weekNumber: 4,
    dayOfWeek: 0,
    name: 'Descanso',
    type: 'rest',
    isCompleted: false,
  },
];

// Previous sessions (completed)
export const mockSessionLogs: SessionLog[] = [
  {
    id: 'sl1',
    sessionId: 'rs1',
    actualDistance: 8.2,
    actualDuration: 42,
    averagePace: '5:08',
    rpe: 5,
    notes: 'Me sentí bien, buen ritmo sin forzar',
    completedAt: format(weekStart, "yyyy-MM-dd'T'08:30:00"),
  },
  {
    id: 'sl2',
    sessionId: 'prev1',
    actualDistance: 10.1,
    actualDuration: 52,
    averagePace: '5:09',
    rpe: 8,
    notes: 'Series duras pero las saqué todas',
    completedAt: format(subDays(weekStart, 5), "yyyy-MM-dd'T'07:00:00"),
  },
  {
    id: 'sl3',
    sessionId: 'prev2',
    actualDistance: 15.3,
    actualDuration: 82,
    averagePace: '5:21',
    rpe: 6,
    completedAt: format(subDays(weekStart, 2), "yyyy-MM-dd'T'09:00:00"),
  },
];

export const mockWeeklySummary: WeeklySummary = {
  weekNumber: 4,
  plannedDistance: 46,
  completedDistance: 8.2,
  plannedSessions: 5,
  completedSessions: 1,
};

// Previous weeks for history
export const mockPreviousSessions = [
  {
    date: format(subDays(weekStart, 1), 'yyyy-MM-dd'),
    name: 'Tirada larga',
    type: 'long' as const,
    distance: 15.3,
    duration: 82,
    pace: '5:21',
  },
  {
    date: format(subDays(weekStart, 3), 'yyyy-MM-dd'),
    name: 'Tempo',
    type: 'tempo' as const,
    distance: 6.2,
    duration: 31,
    pace: '5:00',
  },
  {
    date: format(subDays(weekStart, 5), 'yyyy-MM-dd'),
    name: 'Series',
    type: 'intervals' as const,
    distance: 10.1,
    duration: 52,
    pace: '5:09',
  },
  {
    date: format(subDays(weekStart, 6), 'yyyy-MM-dd'),
    name: 'Rodaje Z2',
    type: 'easy' as const,
    distance: 8.0,
    duration: 41,
    pace: '5:07',
  },
];
