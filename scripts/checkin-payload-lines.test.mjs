import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePayloadLines } from '../src/lib/ai/checkin-payload-lines.js'

test('resolvePayloadLines renders form field labels for campo payload keys', () => {
  const lines = resolvePayloadLines(
    {
      campo_1: 'Semana solida',
      campo_2: 8,
      campo_3: ['Sueno', 'Energia'],
    },
    [],
    [
      { id: 'campo_1', label: 'Como describirias tu semana?' },
      { id: 'campo_2', label: 'Rendimiento percibido' },
      { id: 'campo_3', label: 'Puntos positivos' },
    ]
  )

  assert.deepEqual(lines, [
    '- Como describirias tu semana?: Semana solida',
    '- Rendimiento percibido: 8',
    '- Puntos positivos: Sueno, Energia',
  ])
})

test('resolvePayloadLines keeps metric labels and falls back to raw campo keys', () => {
  const lines = resolvePayloadLines(
    {
      campo_99: 'Respuesta legacy',
      'metric_metric-1': 72,
    },
    [{ id: 'metric-1', name: 'Variabilidad frecuencia cardiaca', unit: 'ppm' }],
    []
  )

  assert.deepEqual(lines, [
    '- campo_99: Respuesta legacy',
    '- Variabilidad frecuencia cardiaca (ppm): 72',
  ])
})
