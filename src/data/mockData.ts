import {
  TrainingProgram,
  TrainingDay,
  TrainingColumn,
  TrainingExercise,
  TrainingCell,
  MacroPlan,
  DietPlan,
  DailyAdherence,
  DailyMetrics,
  ClientProfile
} from '@/types/training';

export const mockProgram: TrainingProgram = {
  id: '1',
  name: 'Hipertrofia Fase 1',
  totalWeeks: 6,
  effectiveFrom: '2024-01-15',
};

export const mockDays: TrainingDay[] = [
  { id: 'd1', name: 'Pecho', order: 1 },
  { id: 'd2', name: 'Espalda', order: 2 },
  { id: 'd3', name: 'Pierna', order: 3 },
  { id: 'd4', name: 'Hombro', order: 4 },
  { id: 'd5', name: 'Brazos', order: 5 },
];

export const mockColumns: TrainingColumn[] = [
  { id: 'c1', label: 'Ejercicio', type: 'text', scope: 'exercise', editable: false, order: 1 },
  { id: 'c2', label: 'Series', type: 'text', scope: 'exercise', editable: false, order: 2 },
  { id: 'c3', label: 'Reps', type: 'text', scope: 'exercise', editable: false, order: 3 },
  { id: 'c4', label: 'RIR', type: 'text', scope: 'exercise', editable: false, order: 4 },
  { id: 'c5', label: 'Descanso', type: 'text', scope: 'exercise', editable: false, order: 5 },
  { id: 'c6', label: 'Tips', type: 'text', scope: 'exercise', editable: false, order: 6 },
  { id: 'c7', label: 'Peso (kg)', type: 'number', scope: 'week', editable: true, order: 7 },
  { id: 'c8', label: 'Reps hechas', type: 'number', scope: 'week', editable: true, order: 8 },
  { id: 'c9', label: 'Notas', type: 'textarea', scope: 'week', editable: true, order: 9 },
];

export const mockExercises: TrainingExercise[] = [
  // Pecho
  { id: 'e1', dayId: 'd1', name: 'Press banca', order: 1 },
  { id: 'e2', dayId: 'd1', name: 'Press inclinado mancuernas', order: 2 },
  { id: 'e3', dayId: 'd1', name: 'Aperturas con cables', order: 3 },
  { id: 'e4', dayId: 'd1', name: 'Fondos en paralelas', order: 4 },
  { id: 'e5', dayId: 'd1', name: 'Pullover', order: 5 },
  // Espalda
  { id: 'e6', dayId: 'd2', name: 'Dominadas', order: 1 },
  { id: 'e7', dayId: 'd2', name: 'Remo con barra', order: 2 },
  { id: 'e8', dayId: 'd2', name: 'Jalón al pecho', order: 3 },
  { id: 'e9', dayId: 'd2', name: 'Remo unilateral', order: 4 },
  { id: 'e10', dayId: 'd2', name: 'Face pulls', order: 5 },
  // Pierna
  { id: 'e11', dayId: 'd3', name: 'Sentadilla', order: 1 },
  { id: 'e12', dayId: 'd3', name: 'Prensa', order: 2 },
  { id: 'e13', dayId: 'd3', name: 'Peso muerto rumano', order: 3 },
  { id: 'e14', dayId: 'd3', name: 'Curl femoral', order: 4 },
  { id: 'e15', dayId: 'd3', name: 'Extensión cuádriceps', order: 5 },
  { id: 'e16', dayId: 'd3', name: 'Elevación gemelos', order: 6 },
  // Hombro
  { id: 'e17', dayId: 'd4', name: 'Press militar', order: 1 },
  { id: 'e18', dayId: 'd4', name: 'Elevaciones laterales', order: 2 },
  { id: 'e19', dayId: 'd4', name: 'Pájaros', order: 3 },
  { id: 'e20', dayId: 'd4', name: 'Face pulls', order: 4 },
  // Brazos
  { id: 'e21', dayId: 'd5', name: 'Curl bíceps barra', order: 1 },
  { id: 'e22', dayId: 'd5', name: 'Curl martillo', order: 2 },
  { id: 'e23', dayId: 'd5', name: 'Press francés', order: 3 },
  { id: 'e24', dayId: 'd5', name: 'Extensión tríceps polea', order: 4 },
];

// Generate mock cells with coach data
export const generateMockCells = (): TrainingCell[] => {
  const cells: TrainingCell[] = [];

  const coachData: Record<string, Record<string, string>> = {
    'e1': { c2: '4', c3: '8-10', c4: '2', c5: '2-3 min', c6: 'Controla la bajada' },
    'e2': { c2: '3', c3: '10-12', c4: '2', c5: '90 seg', c6: 'Retracción escapular' },
    'e3': { c2: '3', c3: '12-15', c4: '1', c5: '60 seg', c6: 'Squeeze al final' },
    'e4': { c2: '3', c3: '8-12', c4: '2', c5: '90 seg', c6: 'Inclínate adelante' },
    'e5': { c2: '3', c3: '12-15', c4: '1', c5: '60 seg', c6: 'No bajes demasiado' },
    'e6': { c2: '4', c3: '6-10', c4: '2', c5: '2-3 min', c6: 'Full ROM' },
    'e7': { c2: '4', c3: '8-10', c4: '2', c5: '2 min', c6: 'Pecho al suelo' },
    'e8': { c2: '3', c3: '10-12', c4: '2', c5: '90 seg', c6: 'Aprieta abajo' },
    'e9': { c2: '3', c3: '10-12', c4: '2', c5: '60 seg', c6: 'Rota el torso' },
    'e10': { c2: '3', c3: '15-20', c4: '0', c5: '45 seg', c6: 'Rotación externa' },
    'e11': { c2: '4', c3: '6-8', c4: '2', c5: '3 min', c6: 'Profundidad completa' },
    'e12': { c2: '4', c3: '10-12', c4: '2', c5: '2 min', c6: 'Pies altos' },
    'e13': { c2: '4', c3: '10-12', c4: '2', c5: '2 min', c6: 'Estira isquios' },
    'e14': { c2: '3', c3: '12-15', c4: '1', c5: '60 seg', c6: 'Aguanta arriba' },
    'e15': { c2: '3', c3: '12-15', c4: '1', c5: '60 seg', c6: 'Controla bajada' },
    'e16': { c2: '4', c3: '12-20', c4: '1', c5: '45 seg', c6: 'Estira bien' },
    'e17': { c2: '4', c3: '6-8', c4: '2', c5: '2 min', c6: 'Core activado' },
    'e18': { c2: '4', c3: '12-15', c4: '1', c5: '45 seg', c6: 'Codos fijos' },
    'e19': { c2: '3', c3: '15-20', c4: '0', c5: '45 seg', c6: 'Pecho apoyado' },
    'e20': { c2: '3', c3: '15-20', c4: '0', c5: '45 seg', c6: 'Rotación externa' },
    'e21': { c2: '3', c3: '8-10', c4: '2', c5: '60 seg', c6: 'Sin balanceo' },
    'e22': { c2: '3', c3: '10-12', c4: '2', c5: '60 seg', c6: 'Codos pegados' },
    'e23': { c2: '3', c3: '8-10', c4: '2', c5: '60 seg', c6: 'Codos fijos' },
    'e24': { c2: '3', c3: '12-15', c4: '1', c5: '45 seg', c6: 'Extensión completa' },
  };

  mockExercises.forEach(exercise => {
    // Coach data (same for all weeks)
    mockColumns.forEach(col => {
      if (!col.editable && coachData[exercise.id]?.[col.id]) {
        cells.push({
          id: `${exercise.id}-${col.id}-0`,
          exerciseId: exercise.id,
          columnId: col.id,
          weekNumber: 0, // 0 = applies to all weeks
          value: coachData[exercise.id][col.id],
        });
      }
    });

    // Sample client data for week 1
    if (exercise.id === 'e1') {
      cells.push({ id: `${exercise.id}-c7-1`, exerciseId: exercise.id, columnId: 'c7', weekNumber: 1, value: '80' });
      cells.push({ id: `${exercise.id}-c8-1`, exerciseId: exercise.id, columnId: 'c8', weekNumber: 1, value: '8,8,7,6' });
      cells.push({ id: `${exercise.id}-c9-1`, exerciseId: exercise.id, columnId: 'c9', weekNumber: 1, value: 'Me costó la última' });
    }
    if (exercise.id === 'e2') {
      cells.push({ id: `${exercise.id}-c7-1`, exerciseId: exercise.id, columnId: 'c7', weekNumber: 1, value: '24' });
      cells.push({ id: `${exercise.id}-c8-1`, exerciseId: exercise.id, columnId: 'c8', weekNumber: 1, value: '12,11,10' });
    }
  });

  return cells;
};

export const mockMacroPlan: MacroPlan = {
  id: 'm1',
  kcal: 2400,
  protein: 180,
  carbs: 280,
  fat: 70,
  stepsGoal: 10000,
  cardioGoal: '2×30\' Z2 semanal',
  effectiveFrom: '2024-01-15',
};

export const mockDietPlan: DietPlan = {
  id: 'dp1',
  effectiveFrom: '2024-01-15',
  meals: [
    {
      id: 'mt1',
      name: 'Desayuno',
      options: [
        {
          id: 'mo1',
          name: 'Opción A - Clásico',
          foods: ['4 claras + 1 huevo entero', '80g avena', '1 plátano', '10g mantequilla cacahuete'],
          tips: 'Puedes cambiar plátano por manzana',
        },
        {
          id: 'mo2',
          name: 'Opción B - Rápido',
          foods: ['Batido: 40g proteína, 60g avena, leche desnatada', '1 pieza fruta'],
          tips: 'Ideal si tienes poco tiempo',
        },
      ],
    },
    {
      id: 'mt2',
      name: 'Media mañana',
      options: [
        {
          id: 'mo3',
          name: 'Snack proteico',
          foods: ['150g yogur griego 0%', '30g nueces', '100g frutos rojos'],
        },
      ],
    },
    {
      id: 'mt3',
      name: 'Comida',
      options: [
        {
          id: 'mo4',
          name: 'Pollo con arroz',
          foods: ['200g pechuga pollo', '120g arroz (peso crudo)', '200g verduras variadas', '1 cucharada aceite oliva'],
          tips: 'Puedes cambiar pollo por pavo',
        },
        {
          id: 'mo5',
          name: 'Pescado con patata',
          foods: ['200g pescado blanco', '250g patata cocida', '200g ensalada', '1 cucharada aceite oliva'],
        },
      ],
    },
    {
      id: 'mt4',
      name: 'Merienda / Pre-entreno',
      options: [
        {
          id: 'mo6',
          name: 'Pre-entreno carbos',
          foods: ['40g tortitas arroz', '20g mantequilla cacahuete', '1 plátano'],
          coachNote: 'Tomar 1-2h antes de entrenar',
        },
      ],
    },
    {
      id: 'mt5',
      name: 'Cena',
      options: [
        {
          id: 'mo7',
          name: 'Cena ligera',
          foods: ['150g carne magra o pescado', '200g verduras', '1 cucharada aceite'],
          tips: 'Evitar carbos complejos en la cena',
        },
        {
          id: 'mo8',
          name: 'Tortilla completa',
          foods: ['3 huevos + 2 claras', '100g champiñones', '50g jamón serrano', 'Ensalada verde'],
        },
      ],
    },
  ],
};

export const mockAdherence: DailyAdherence[] = [
  { id: 'a1', date: '2024-01-28', adherencePercent: 90, notes: 'Me pasé un poco en la cena' },
  { id: 'a2', date: '2024-01-27', adherencePercent: 100 },
  { id: 'a3', date: '2024-01-26', adherencePercent: 85, notes: 'Comida fuera con amigos' },
  { id: 'a4', date: '2024-01-25', adherencePercent: 100 },
  { id: 'a5', date: '2024-01-24', adherencePercent: 95 },
  { id: 'a6', date: '2024-01-23', adherencePercent: 100 },
  { id: 'a7', date: '2024-01-22', adherencePercent: 80, notes: 'Domingo familiar' },
];

export const mockDailyMetrics: DailyMetrics[] = [
  { id: 'dm1', date: '2024-01-28', weight: 78.2, steps: 9500, sleepHours: 7.5 },
  { id: 'dm2', date: '2024-01-27', weight: 78.4, steps: 12000, sleepHours: 8 },
  { id: 'dm3', date: '2024-01-26', weight: 78.1, steps: 8000, sleepHours: 6.5, notes: 'Dormí mal' },
  { id: 'dm4', date: '2024-01-25', weight: 78.3, steps: 11000, sleepHours: 7 },
  { id: 'dm5', date: '2024-01-24', weight: 78.5, steps: 10500, sleepHours: 7.5 },
];

export const mockProfile: ClientProfile = {
  id: 'client1',
  name: 'Carlos García',
  email: 'carlos@example.com',
  coachName: 'Miguel Trainer',
  goal: 'Ganar masa muscular manteniendo definición',
  avatarUrl: undefined,
};
