import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgeDistribution, getAge } from '../src/lib/age-distribution.js'

const today = new Date(2026, 9, 9)

test('calculates completed years around the birthday', () => {
    assert.equal(getAge('1996-10-09', today), 30)
    assert.equal(getAge('1996-10-10', today), 29)
    assert.equal(getAge('2027-01-01', today), null)
    assert.equal(getAge('2000-02-30', today), null)
})

test('puts boundary ages into one group and reports missing dates', () => {
    const ages = [17, 18, 30, 31, 40, 41, 60, 61]
    const activeClientIds = ages.map((_, index) => `client-${index}`).concat('missing')
    const baselines = ages.map((age, index) => ({
        client_id: `client-${index}`,
        birth_date: `${2026 - age}-10-09`,
    }))
    baselines.push({ client_id: 'inactive', birth_date: '1980-01-01' })

    const distribution = buildAgeDistribution(activeClientIds, baselines, today)

    assert.deepEqual(distribution.groups.map((group) => group.count), [1, 2, 2, 2, 1])
    assert.equal(distribution.known, 8)
    assert.equal(distribution.unknown, 1)
    assert.equal(distribution.total, 9)
})
