import assert from 'node:assert/strict'
import test from 'node:test'
import { BODY_REGIONS } from '../src/lib/studio/body-map.js'
import {
    emptyInjuryForm,
    injuryFields,
    injuryToForm,
    regionLabel,
    regionStates,
    sortInjuries,
    structuresFor,
} from '../src/lib/studio/body-rules.js'

test('el mapa no repite zonas y cada una tiene forma', () => {
    const ids = BODY_REGIONS.map(region => region.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(BODY_REGIONS.every(region => region.polygon || region.ellipse))
    assert.ok(BODY_REGIONS.some(region => region.v === 'f') && BODY_REGIONS.some(region => region.v === 'b'))
})

test('las zonas se nombran con su lado', () => {
    assert.match(regionLabel('hombro_d'), /derecho/)
    assert.match(regionLabel('hombro_i'), /izquierdo/)
    assert.equal(regionLabel('desconocida'), 'desconocida')
})

test('cada lado comparte estructuras, y un músculo ofrece lesiones musculares', () => {
    assert.deepEqual(structuresFor('rodilla_d'), structuresFor('rodilla_i'))
    assert.ok(structuresFor('rodilla_d').includes('Menisco interno'))
    assert.ok(structuresFor('pectoral_d').includes('Rotura fibrilar'))
    assert.deepEqual(structuresFor('cabeza'), [])
})

test('las activas van primero y marcan la zona', () => {
    const injuries = [
        { id: 'a', region: 'lumbar', status: 'past', updated_at: '2026-11-03T00:00:00Z' },
        { id: 'b', region: 'lumbar', status: 'active', updated_at: '2026-11-01T00:00:00Z' },
        { id: 'c', region: 'codo_d', status: 'past', updated_at: '2026-11-04T00:00:00Z' },
    ]
    assert.deepEqual(sortInjuries(injuries).map(injury => injury.id), ['b', 'c', 'a'])
    assert.equal(regionStates(injuries).get('lumbar'), 'active')
    assert.equal(regionStates(injuries).get('codo_d'), 'past')
})

test('una lesión necesita estructura o detalle', () => {
    assert.ok(injuryFields(emptyInjuryForm('lumbar')).error)
    const { fields } = injuryFields({ ...emptyInjuryForm('lumbar'), detail: ' Operado ' })
    assert.deepEqual([fields.detail, fields.structure, fields.status], ['Operado', null, 'active'])
})

test('editar conserva la versión leída', () => {
    const form = injuryToForm({ id: 'a', version: 3, region: 'lumbar', structure: null, detail: 'x', occurred: null, status: 'past' })
    assert.deepEqual([form.version, form.structure, form.status], [3, '', 'past'])
})
