import test from 'node:test'
import assert from 'node:assert/strict'

import { chunkList, fetchAllPages, fetchAllPagesIn } from '../src/lib/supabase/fetch-all-pages.js'

/** Simula PostgREST: devuelve como mucho `cap` filas del rango pedido. */
function fakeTable(total, cap = 1000) {
    const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
    const calls = []
    const fetchPage = async (from, to) => {
        calls.push([from, to])
        const end = Math.min(to + 1, from + cap)
        return { data: rows.slice(from, end), error: null }
    }
    return { rows, calls, fetchPage }
}

test('trae más de 1.000 filas pidiendo por páginas', async () => {
    const { rows, calls, fetchPage } = fakeTable(2345)
    const result = await fetchAllPages(fetchPage)
    assert.equal(result.error, null)
    assert.deepEqual(result.data, rows)
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('con exactamente 1.000 filas pide una página más (vacía) y para', async () => {
    const { calls, fetchPage } = fakeTable(1000)
    const result = await fetchAllPages(fetchPage)
    assert.equal(result.data.length, 1000)
    assert.equal(calls.length, 2)
})

test('sin filas devuelve una lista vacía', async () => {
    const { fetchPage } = fakeTable(0)
    const result = await fetchAllPages(fetchPage)
    assert.deepEqual(result, { data: [], error: null })
})

test('si una página falla devuelve el error y no datos a medias', async () => {
    let n = 0
    const result = await fetchAllPages(async () => {
        n += 1
        if (n === 2) return { data: null, error: { message: 'timeout' } }
        return { data: Array.from({ length: 1000 }, (_, i) => i), error: null }
    })
    assert.equal(result.data, null)
    assert.equal(result.error.message, 'timeout')
})

test('para en el tope de páginas con un error en vez de seguir sin fin', async () => {
    const result = await fetchAllPages(async () => ({ data: [1, 2], error: null }), { pageSize: 2, maxPages: 3 })
    assert.equal(result.data, null)
    assert.match(result.error.message, /demasiado grande/)
})

test('chunkList parte la lista sin perder ni repetir', () => {
    assert.deepEqual(chunkList([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
    assert.deepEqual(chunkList([], 2), [])
    assert.throws(() => chunkList([1], 0))
})

test('fetchAllPagesIn trocea los ids y pagina cada trozo', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `c${i}`)
    const seen = []
    const result = await fetchAllPagesIn(
        ids,
        async (chunk, from, to) => {
            seen.push([chunk.join(','), from, to])
            // Cada trozo tiene 3 filas por id; páginas de 4.
            const rows = chunk.flatMap((id) => [1, 2, 3].map((n) => `${id}-${n}`))
            return { data: rows.slice(from, to + 1), error: null }
        },
        { chunkSize: 2, pageSize: 4 }
    )
    assert.equal(result.error, null)
    assert.equal(result.data.length, 15)
    assert.equal(new Set(result.data).size, 15)
    assert.deepEqual(seen.map((s) => s[0]), ['c0,c1', 'c0,c1', 'c2,c3', 'c2,c3', 'c4'])
})
