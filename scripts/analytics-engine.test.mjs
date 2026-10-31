import test from 'node:test'
import assert from 'node:assert/strict'

const { aggregate, athleteScope, previousRange, resolveRange, runWidget, suggestTitle, timeBuckets } = await import('../src/lib/analytics/engine.js')
const { axesFor, breakdownsFor, dimensionsFor, visualsFor } = await import('../src/lib/analytics/catalog.js')

// Viernes 30-10-2026
const TODAY = '2026-10-30'

function set(a, d, x, kg, reps, extra = {}) {
  return { a, d, x, g: extra.g ?? 'Cuádriceps', v: extra.v ?? true, kg, reps, rir: extra.rir ?? null, prir: extra.prir ?? null, e1rm: kg * (1 + reps / 30), ton: kg * reps }
}

function facts() {
  return {
    today: TODAY,
    loadedFrom: '2026-05-01',
    athletes: [
      { id: 'ana', name: 'Ana', status: 'active' },
      { id: 'bea', name: 'Bea', status: 'active' },
      { id: 'carlos', name: 'Carlos', status: 'inactive' },
    ],
    exercises: [
      { key: 'squat', name: 'Sentadilla', group: 'Cuádriceps' },
      { key: 'rdl', name: 'Peso muerto rumano', group: 'Isquiotibiales' },
      { key: 'jump', name: 'Salto al cajón', group: 'Piernas' },
    ],
    strength: [
      set('ana', '2026-10-05', 'squat', 100, 5, { rir: 2, prir: 2 }),
      set('ana', '2026-10-05', 'squat', 90, 8, { rir: 3, prir: 2 }),
      set('ana', '2026-10-26', 'squat', 110, 5, { rir: 1, prir: 2 }),
      set('ana', '2026-10-27', 'rdl', 80, 10, { g: 'Isquiotibiales' }),
      set('ana', '2026-10-27', 'jump', 0, 5, { g: 'Piernas', v: false }),
      set('bea', '2026-10-06', 'rdl', 60, 10, { g: 'Isquiotibiales' }),
      set('bea', '2026-10-28', 'rdl', 70, 10, { g: 'Isquiotibiales' }),
      set('carlos', '2026-10-20', 'squat', 140, 3),
      // Periodo anterior (para comparar KPIs con 4 semanas)
      set('ana', '2026-09-20', 'squat', 95, 5),
    ],
    body: [
      { a: 'ana', d: '2026-10-03', weight: 72, steps: 8000, sleep_h: 7, sleep_score: null, hrv: null, fatigue: null },
      { a: 'ana', d: '2026-10-05', weight: 71.6, steps: 10000, sleep_h: 8, sleep_score: null, hrv: null, fatigue: null },
      { a: 'ana', d: '2026-10-29', weight: 70.4, steps: null, sleep_h: null, sleep_score: null, hrv: null, fatigue: null },
    ],
    cardio: [
      { a: 'ana', d: '2026-10-10', disc: 'run', km: 10, min: 50, hr: 150, rpe: 6, elev: 100 },
      { a: 'ana', d: '2026-10-12', disc: 'bike', km: 40, min: 90, hr: 130, rpe: null, elev: null },
      { a: 'bea', d: '2026-10-11', disc: 'run', km: 5, min: 30, hr: null, rpe: 7, elev: null },
    ],
    tracking: [
      { a: 'ana', adherence: 0.9, block_e1rm: 0.1, days_since_log: 3 },
      { a: 'bea', adherence: 0.5, block_e1rm: null, days_since_log: 2 },
      { a: 'carlos', adherence: null, block_e1rm: null, days_since_log: 10 },
    ],
  }
}

const board = (extra = {}) => ({ period: '4w', status: 'active', athleteIds: [], ...extra })

test('periodos', () => {
  assert.deepEqual(resolveRange(board(), TODAY), { from: '2026-10-03', to: TODAY })
  assert.deepEqual(resolveRange(board({ period: 'custom', from: '2026-09-01', to: '2026-09-30' }), TODAY), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(resolveRange(board({ period: 'custom', from: '2026-10-10', to: '2026-10-01' }), TODAY).to, TODAY, 'fechas al revés: periodo por defecto')
  assert.deepEqual(previousRange({ from: '2026-10-03', to: TODAY }), { from: '2026-09-05', to: '2026-10-02' })
  assert.deepEqual(timeBuckets('week', { from: '2026-10-03', to: TODAY }), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  assert.deepEqual(timeBuckets('month', { from: '2026-09-15', to: '2026-11-02' }), ['2026-09-01', '2026-10-01', '2026-11-01'])
})

test('catálogo: ejes, desgloses y visuales coherentes', () => {
  assert.deepEqual(dimensionsFor('weight'), ['day', 'week', 'month', 'athlete', 'none'])
  assert.deepEqual(breakdownsFor('e1rm', 'week'), ['athlete', 'exercise', 'muscle_group'])
  assert.deepEqual(breakdownsFor('cardio_km', 'discipline'), ['athlete'])
  assert.ok(!visualsFor('adherence').includes('line'), 'el seguimiento no tiene eje de tiempo')
  assert.deepEqual(axesFor('e1rm', 'scatter'), ['athlete', 'exercise'])
  assert.deepEqual(axesFor('e1rm', 'kpi'), ['none'])
})

test('alcance de atletas: estado, selección del tablero y del gráfico', () => {
  assert.deepEqual([...athleteScope(facts(), board())], ['ana', 'bea'])
  assert.deepEqual([...athleteScope(facts(), board({ athleteIds: ['carlos'] }))], ['carlos'], 'elegido a mano aunque esté inactivo')
  assert.deepEqual([...athleteScope(facts(), board(), { athleteIds: ['bea'] })], ['bea'])
})

test('KPI con comparación con el periodo anterior', () => {
  const result = runWidget(facts(), { metric: 'e1rm', visual: 'kpi', dimensions: ['none'], filters: { exerciseKeys: ['squat'] }, options: { compare: true } }, board())
  assert.equal(result.kind, 'kpi')
  assert.equal(result.value, 110 * (1 + 5 / 30))
  assert.equal(result.previous, 95 * (1 + 5 / 30))
  assert.deepEqual(result.detail, { kg: 110, reps: 5, rir: 1, d: '2026-10-26' })
})

test('línea: e1RM por semana, una serie por ejercicio, con huecos', () => {
  const result = runWidget(facts(), { metric: 'e1rm', visual: 'line', dimensions: ['week', 'exercise'], filters: { athleteIds: ['ana'] } }, board())
  assert.equal(result.kind, 'series')
  assert.deepEqual(result.categories.map(c => c.key), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  const squat = result.series.find(s => s.key === 'squat')
  assert.equal(squat.label, 'Sentadilla')
  assert.deepEqual(squat.values, [null, 100 * (1 + 5 / 30), null, null, 110 * (1 + 5 / 30)])
  assert.equal(squat.details[1].kg, 100, 'el tooltip da la serie que marca el e1RM')
})

test('barras: progreso e1RM por atleta en un ejercicio (quién responde mejor)', () => {
  const result = runWidget(facts(), { metric: 'e1rm_change', visual: 'bar', dimensions: ['athlete'], filters: { exerciseKeys: ['rdl'] } }, board())
  assert.equal(result.kind, 'series')
  // Ana solo tiene una semana de rumano: sin Δ; Bea 60×10 → 70×10
  const values = Object.fromEntries(result.categories.map((c, i) => [c.label, result.series[0].values[i]]))
  assert.ok(Math.abs(values.Bea - (70 / 60 - 1)) < 1e-9)
  assert.equal(values.Ana, null)
})

test('volumen por grupo muscular: la pliometría no cuenta', () => {
  const result = runWidget(facts(), { metric: 'sets', visual: 'bar', dimensions: ['muscle_group'] }, board())
  assert.deepEqual(result.categories.map(c => c.key).sort(), ['Cuádriceps', 'Isquiotibiales'])
})

test('tabla de cartera: columnas de fuentes distintas por atleta', () => {
  const result = runWidget(facts(), {
    metric: 'sets_per_week', visual: 'table', dimensions: ['athlete'],
    options: { columns: ['adherence', 'weight', 'cardio_km'] },
  }, board())
  assert.equal(result.kind, 'table')
  assert.deepEqual(result.columns, ['sets_per_week', 'adherence', 'weight', 'cardio_km'])
  const ana = result.rows.find(r => r.key === 'ana')
  assert.equal(ana.values[0], 5 / 4, '5 series en 28 días')
  assert.equal(ana.values[1], 0.9)
  assert.ok(Math.abs(ana.values[2] - (72 + 71.6 + 70.4) / 3) < 1e-9)
  assert.equal(ana.values[3], 50)
  const bea = result.rows.find(r => r.key === 'bea')
  assert.equal(bea.values[2], null, 'sin peso registrado')
})

test('dispersión: series por semana frente a progreso e1RM', () => {
  const result = runWidget(facts(), { metric: 'sets_per_week', visual: 'scatter', dimensions: ['athlete'], options: { yMetric: 'e1rm_change' } }, board())
  assert.equal(result.kind, 'scatter')
  assert.deepEqual(result.points.map(p => p.label).sort(), ['Ana', 'Bea'])
  assert.equal(runWidget(facts(), { metric: 'sets', visual: 'scatter', dimensions: ['athlete'] }, board()).kind, 'empty')
})

test('cardio: km por semana y disciplina, ritmo y filtros', () => {
  const result = runWidget(facts(), { metric: 'cardio_km', visual: 'bar', dimensions: ['week', 'discipline'] }, board())
  assert.deepEqual(result.series.map(s => s.label), ['Bici', 'Carrera'])
  const run = result.series.find(s => s.key === 'run')
  assert.equal(run.values[1], 15)
  const pace = runWidget(facts(), { metric: 'cardio_pace', visual: 'kpi', dimensions: ['none'], filters: { disciplines: ['run'] } }, board())
  assert.equal(pace.value, 80 / 15)
})

test('agregados de cuerpo y RIR', () => {
  const rows = facts().body
  assert.ok(Math.abs(aggregate('weight_change', rows, { days: 28 }) - (70.4 - (72 + 71.6) / 2)) < 1e-9)
  assert.equal(aggregate('steps', rows, { days: 28 }), 9000)
  const strength = facts().strength.filter(r => r.a === 'ana' && r.x === 'squat' && r.d >= '2026-10-01')
  assert.equal(aggregate('rir_dev', strength, { days: 28 }), 0)
  assert.equal(aggregate('strength_sessions', strength, { days: 28 }), 2)
})

test('sin datos o sin atletas: mensaje en vez de gráfico vacío', () => {
  assert.equal(runWidget(facts(), { metric: 'hrv', visual: 'line', dimensions: ['week'] }, board()).kind, 'series', 'semanas sin datos: línea vacía')
  assert.equal(runWidget(facts(), { metric: 'hrv', visual: 'kpi', dimensions: ['none'] }, board()).kind, 'kpi')
  assert.equal(runWidget(facts(), { metric: 'e1rm', visual: 'line', dimensions: ['week'] }, board({ athleteIds: ['nadie'] })).kind, 'empty')
})

test('título automático', () => {
  assert.equal(suggestTitle(facts(), { metric: 'e1rm', visual: 'line', dimensions: ['week', 'athlete'], filters: { exerciseKeys: ['rdl'] } }), 'e1RM por semana y atleta · Peso muerto rumano')
  assert.equal(suggestTitle(facts(), { metric: 'sets_per_week', visual: 'scatter', dimensions: ['athlete'], options: { yMetric: 'e1rm_change' } }), 'Series por semana vs Progreso e1RM por atleta')
})
