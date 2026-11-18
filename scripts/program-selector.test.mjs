import assert from 'node:assert/strict'
import test from 'node:test'

import {
    findProgramWithLogsInSamePeriod,
    formatLoggedSets,
    formatProgramPeriod,
    programPeriod,
} from '../src/lib/training/program-selector.js'

// Forma de los programas de un atleta real con duplicados (datos anonimizados).
const programs = [
    { id: 'activo', status: 'active', effectiveFrom: '2026-11-17', effectiveTo: '2026-12-20', totalWeeks: 4, loggedSets: 0 },
    { id: 'bloque-iv-vacio', status: 'archived', effectiveFrom: '2026-10-21', effectiveTo: '2026-11-22', totalWeeks: 4, loggedSets: 0 },
    { id: 'bloque-iv', status: 'archived', effectiveFrom: '2026-10-19', effectiveTo: '2026-11-22', totalWeeks: 4, loggedSets: 220 },
    { id: 'rodilla', status: 'archived', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-21', totalWeeks: 2, loggedSets: 99 },
    { id: 'recuperacion-iii', status: 'archived', effectiveFrom: '2026-09-28', effectiveTo: null, totalWeeks: 4, loggedSets: 16 },
    { id: 'fase-iii', status: 'archived', effectiveFrom: '2026-08-10', effectiveTo: null, totalWeeks: 8, loggedSets: 354 },
    { id: 'fase-i', status: 'archived', effectiveFrom: '2026-08-10', effectiveTo: null, totalWeeks: 12, loggedSets: 0 },
    { id: 'tercer-bloque', status: 'archived', effectiveFrom: '2026-06-08', effectiveTo: null, totalWeeks: 9, loggedSets: 270 },
]

test('un programa vacío apunta al que tiene entrenos en las mismas fechas', () => {
    assert.equal(findProgramWithLogsInSamePeriod(programs, 'fase-i')?.id, 'fase-iii')
    assert.equal(findProgramWithLogsInSamePeriod(programs, 'bloque-iv-vacio')?.id, 'bloque-iv')
})

test('sin otro programa con entrenos en esas fechas no sugiere nada', () => {
    assert.equal(findProgramWithLogsInSamePeriod(programs, 'activo'), null)
    assert.equal(findProgramWithLogsInSamePeriod(programs, 'no-existe'), null)
    assert.equal(findProgramWithLogsInSamePeriod([], 'fase-i'), null)
})

test('sin recuento de series no sugiere nada', () => {
    const sinRecuento = programs.map((program) => ({ ...program, loggedSets: null }))
    assert.equal(findProgramWithLogsInSamePeriod(sinRecuento, 'fase-i'), null)
})

test('el periodo usa la fecha de fin o, si falta, las semanas', () => {
    const conFin = programPeriod({ effectiveFrom: '2026-10-08', effectiveTo: '2026-10-21', totalWeeks: 2 })
    assert.equal(new Date(conFin.end).toISOString().slice(0, 10), '2026-10-21')
    const sinFin = programPeriod({ effectiveFrom: '2026-08-10', effectiveTo: null, totalWeeks: 8 })
    assert.equal(new Date(sinFin.end).toISOString().slice(0, 10), '2026-10-04')
    assert.equal(programPeriod({ effectiveFrom: null, totalWeeks: 4 }), null)
})

test('textos de series registradas', () => {
    assert.equal(formatLoggedSets(null), null)
    assert.equal(formatLoggedSets(0), 'Sin entrenos registrados')
    assert.equal(formatLoggedSets(1), '1 serie registrada')
    assert.equal(formatLoggedSets(354), '354 series registradas')
})

test('texto del periodo del programa', () => {
    assert.equal(formatProgramPeriod({ effectiveFrom: '2026-08-10', totalWeeks: 8 }), 'Desde 10 ago 2026 · 8 semanas')
    assert.equal(formatProgramPeriod({ effectiveFrom: '2026-10-08', totalWeeks: 1 }), 'Desde 8 oct 2026 · 1 semana')
    assert.equal(formatProgramPeriod({ effectiveFrom: null, totalWeeks: 0 }), '')
})
