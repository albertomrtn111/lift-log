import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTrainingProgressCsv } from '../src/lib/training/progress-csv.js'

test('buildTrainingProgressCsv exports strength set progression rows', () => {
  const csv = buildTrainingProgressCsv({
    program: {
      id: 'program-1',
      name: 'Bloque Fuerza',
      status: 'active',
      totalWeeks: 4,
      effectiveFrom: '2026-06-01',
      effectiveTo: null,
    },
    maxWeek: 2,
    days: [
      {
        id: 'day-1',
        name: 'Torso',
        order: 1,
        exercises: [
          {
            id: 'exercise-1',
            name: 'Press banca',
            order: 1,
            prescribedSets: 3,
            prescribedReps: '8',
            prescribedRir: 2,
            setsByWeek: {
              1: [
                { weekIndex: 1, setIndex: 0, weightKg: 80, reps: 8, rir: 2, completed: true, notes: 'Solido' },
              ],
              2: [
                { weekIndex: 2, setIndex: 0, weightKg: 82.5, reps: 8, rir: 1, completed: true, notes: null },
              ],
            },
          },
        ],
      },
    ],
  })

  assert.equal(
    csv,
    '\uFEFFPrograma;Día;Ejercicio;Semana;Serie;Peso (kg);Reps;RIR;Completada;Notas;Series prescritas;Reps prescritas;RIR prescrito\n' +
      'Bloque Fuerza;Torso;Press banca;1;1;80;8;2;Sí;Solido;3;8;2\n' +
      'Bloque Fuerza;Torso;Press banca;2;1;82,5;8;1;Sí;;3;8;2'
  )
})

test('buildTrainingProgressCsv includes empty planned exercises when no sets exist', () => {
  const csv = buildTrainingProgressCsv({
    program: {
      id: 'program-1',
      name: 'Bloque Fuerza',
      status: 'active',
      totalWeeks: 1,
      effectiveFrom: '2026-06-01',
      effectiveTo: null,
    },
    maxWeek: 1,
    days: [
      {
        id: 'day-1',
        name: 'Pierna',
        order: 1,
        exercises: [
          {
            id: 'exercise-1',
            name: 'Sentadilla',
            order: 1,
            prescribedSets: 4,
            prescribedReps: '6-8',
            prescribedRir: 1,
            setsByWeek: {},
          },
        ],
      },
    ],
  })

  assert.equal(csv.split('\n')[1], 'Bloque Fuerza;Pierna;Sentadilla;;;;;;;Sin registros;4;6-8;1')
})

