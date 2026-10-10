import assert from 'node:assert/strict'
import test from 'node:test'
import { getWorkspaceExpiryAlerts } from '../src/lib/workspace-expiry-alerts.ts'

const empty = {
    today: '2026-11-11',
    goal: null,
    activeProgram: null,
    macroPlans: [],
    dietPlans: [],
}

test('avisa el día límite del objetivo y después sigue visible', () => {
    const goal = { id: 'goal-1', title: 'Preparar maratón', target_date: '2026-11-11' }
    const today = getWorkspaceExpiryAlerts({ ...empty, goal })
    const later = getWorkspaceExpiryAlerts({ ...empty, today: '2026-11-13', goal })
    assert.equal(today[0]?.daysOverdue, 0)
    assert.equal(later[0]?.daysOverdue, 2)
    assert.equal(today[0]?.tab, 'athlete-profile')
})

test('seis semanas terminan tras 42 días, incluso al cruzar un cambio horario', () => {
    const activeProgram = { id: 'program-1', name: 'Bloque de fuerza', effective_from: '2026-10-01', total_weeks: 6 }
    assert.equal(getWorkspaceExpiryAlerts({ ...empty, today: '2026-11-10', activeProgram }).length, 0)
    assert.equal(getWorkspaceExpiryAlerts({ ...empty, activeProgram })[0]?.endDate, '2026-11-11')
})

test('no avisa de un plan anterior cuando ya hay otro vigente', () => {
    const previous = { id: 'old', effective_from: '2026-10-01', effective_to: '2026-11-10', created_at: '2026-10-01' }
    const current = { id: 'new', effective_from: '2026-11-11', effective_to: null, created_at: '2026-11-11' }
    assert.equal(getWorkspaceExpiryAlerts({ ...empty, macroPlans: [previous, current] }).length, 0)
    assert.equal(getWorkspaceExpiryAlerts({ ...empty, macroPlans: [previous] })[0]?.kind, 'macros')
    assert.equal(getWorkspaceExpiryAlerts({ ...empty, today: '2026-11-10', macroPlans: [previous] })[0]?.daysOverdue, 0)
})

test('omite plazos futuros y prioriza los recién vencidos', () => {
    const goal = { id: 'goal-1', title: 'Definición', target_date: '2026-11-10' }
    const dietPlans = [{ id: 'diet-1', name: 'Menú', effective_from: '2026-10-01', effective_to: '2026-11-11', created_at: '2026-10-01' }]
    const alerts = getWorkspaceExpiryAlerts({ ...empty, goal, dietPlans })
    assert.deepEqual(alerts.map(alert => alert.kind), ['diet', 'goal'])
    assert.equal(getWorkspaceExpiryAlerts({ ...empty, goal: { ...goal, target_date: '2026-11-12' } }).length, 0)
})
