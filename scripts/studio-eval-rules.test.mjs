import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'
import {
    asymmetries,
    asymmetryLevel,
    cellDate,
    compareResults,
    dsi,
    evaluationSummary,
    formatChange,
    formatResult,
    keyOfLabel,
    matchClient,
    parseEvalSheet,
    scores,
    tableTests,
    testDef,
} from '../src/lib/studio/eval-rules.js'
import { columnName, parseRef, parseSheet, readXlsx } from '../src/lib/studio/xlsx-reader.js'

test('catálogo con los nombres de VALD y los generados', () => {
    assert.deepEqual(testDef('cmj'), { name: 'CMJ · Max Jump Height (Imp-Dis)', unit: 'cm', direction: 1, group: 'Countermovement Jump' })
    assert.equal(testDef('sp10lat_r').name, 'Sprint 10 m lateral Right')
    assert.equal(testDef('c405_l').name, 'COD 9 m ida y vuelta (4-5) Left')
    assert.equal(testDef('c404_r').name, 'COD 4-0-4 Right')
    assert.deepEqual(testDef('fvkg_banca'), { name: 'Press de banca · carga', unit: 'kg', direction: 0, group: 'Perfil fuerza-velocidad' })
    assert.equal(testDef('x_salto_cajon').name, 'salto cajon')
    assert.equal(testDef('x_salto_cajon', { names: { x_salto_cajon: 'Salto al cajón' } }).name, 'Salto al cajón')
    assert.equal(testDef('x_mio', { custom: { x_mio: { name: 'Mío', unit: 'cm', direction: 1, group: 'Saltos' } } }).group, 'Saltos')
})

test('nota de 0 a 100 frente a las referencias del centro', () => {
    const result = scores({ cmj: 55, bj: 137.5, rsi: 3.6, sp9_r: 1.6, sp9_l: 1.6 })
    assert.equal(result.each.CMJ, 100)
    assert.equal(result.each.BJ, 50)
    assert.equal(result.each.RSI, 100, 'tope en 100')
    assert.equal(result.each.ACC, 100)
    assert.equal(result.each.COD, null)
    assert.equal(result.count, 4)
    assert.equal(result.total, 87.5)
    assert.equal(scores({}).total, null)
    assert.equal(scores({ c405_r: 5, c405_l: 5 }).each.COD, 0, 'tope en 0')
})

test('asimetrías derecha e izquierda y las que vienen en %', () => {
    const list = asymmetries({ cmj_r: 20, cmj_l: 25, bj_r: 200, bj_l: 200, sp9_r: 1.8, sqiso_asym: 12.5, rsi_r: 2 })
    assert.deepEqual(list.map(entry => [entry.base, Math.round(entry.percent * 10) / 10]), [['cmj', 20], ['bj', 0], ['sqiso_asym', 12.5]])
    assert.equal(list[0].name, 'SLJ · Max Jump Height (Imp-Mom)')
    assert.equal(list[2].name, 'ISOT · Peak Vertical Force')
    assert.deepEqual([asymmetryLevel(9.9), asymmetryLevel(10), asymmetryLevel(15)], ['ok', 'watch', 'high'])
})

test('DSI con la fuerza isométrica del Excel o de VALD', () => {
    assert.equal(dsi({ fcmj: 2000, sqiso: 2500 }), 0.8)
    assert.equal(dsi({ fcmj: 2000, sqiso: 2500, fiso: 4000 }), 0.5)
    assert.equal(dsi({ fcmj: 2000 }), null)
})

test('comparar dos fechas: cambio y si es a mejor según el test', () => {
    const rows = compareResults({ cmj: 40, sp9_r: 2, tmov: 300 }, { cmj: 42, sp9_r: 1.9, rsi: 2 })
    const byKey = Object.fromEntries(rows.map(row => [row.key, row]))
    assert.equal(byKey.cmj.change, 5)
    assert.equal(byKey.cmj.better, true)
    assert.ok(Math.abs(byKey.sp9_r.change + 5) < 1e-9)
    assert.equal(byKey.sp9_r.better, true, 'menos tiempo es mejor')
    assert.equal(byKey.rsi.change, null)
    assert.equal(byKey.tmov.better, null, 'neutro')
    assert.deepEqual(rows.map(row => row.key), ['cmj', 'rsi', 'sp9_r', 'tmov'], 'por grupos')
})

test('tabla de datos: el núcleo, los propios y lo que tenga datos, sin los ocultos', () => {
    const keys = tableTests([{ results: { x_cajon: 50, fvv_banca: 0.5 } }], { hidden: ['ecc'], custom: { x_mio: { name: 'Mío' } } })
    assert.ok(keys.includes('cmj') && keys.includes('x_cajon') && keys.includes('x_mio'))
    assert.ok(!keys.includes('ecc') && !keys.includes('fvv_banca'))
})

test('formato por unidad', () => {
    assert.equal(formatResult(2534.4, 'fcmj'), '2.534')
    assert.equal(formatResult(38.04, 'cmj'), '38')
    assert.equal(formatResult(38.25, 'cmj'), '38,3')
    assert.equal(formatResult(0.2345, 'sldjct_r'), '0,235')
    assert.equal(formatResult(1.234, 'rsi'), '1,23')
    assert.equal(formatChange(4.24), '+4,2 %')
    assert.equal(formatChange(-3), '-3 %')
})

test('etiquetas de las filas del Excel', () => {
    assert.equal(keyOfLabel('CMJ', 6), 'cmj')
    assert.equal(keyOfLabel('cmj dcha', 7), 'cmj_r')
    assert.equal(keyOfLabel('CMJ IZQ', 8), 'cmj_l')
    assert.equal(keyOfLabel('9 m Dch', 20), 'sp9_r')
    assert.equal(keyOfLabel('5M LAT IZQ', 21), 'sp5lat_l')
    assert.equal(keyOfLabel('4-0-5 DCHA', 22), 'c405_r')
    assert.equal(keyOfLabel('cualquier cosa', 26), 'tmov')
    assert.equal(keyOfLabel('Test específico pádel', 30), 'x_fila30')
    assert.equal(keyOfLabel('Salto al cajón', 31), 'x_salto_al_cajon')
    assert.equal(cellDate(46000), '2025-12-09')
    assert.equal(cellDate('2026-10-01T00:00:00'), '2026-10-01')
    assert.equal(cellDate(12), '')
})

test('la hoja de evaluaciones del Excel', () => {
    const cells = new Map()
    const put = (column, row, v, f = false) => cells.set(`${column},${row}`, { v, f })
    put(6, 3, 'Ana Martínez')
    put(6, 5, 'Pádel')
    put(6, 11, 62.5)
    put(9, 5, 46000)
    put(10, 5, 46030)
    put(8, 6, 'CMJ'); put(9, 6, 38.5); put(10, 6, 40)
    put(8, 7, 'CMJ DCHA'); put(9, 7, 20)
    put(8, 8, 'CMJ IZQ'); put(9, 8, 25)
    put(8, 9, 'RSI'); put(9, 9, 1.8, true)
    put(8, 31, 'Salto al cajón'); put(10, 31, '55')
    put(3, 56, 46000); put(3, 58, 2100); put(3, 60, 2600)
    put(3, 38, 46030); put(2, 40, 60); put(3, 40, 0.71)
    const sheet = parseEvalSheet((column, row) => cells.get(`${column},${row}`), 'Hoja1')
    assert.equal(sheet.athlete, 'Ana Martínez')
    assert.deepEqual(sheet.info, { deporte: 'Pádel', peso: 62.5 })
    assert.deepEqual(sheet.names, { x_salto_al_cajon: 'Salto al cajón' })
    assert.deepEqual(sheet.dates, [
        { date: '2025-12-09', results: { cmj: 38.5, cmj_r: 20, cmj_l: 25, fcmj: 2100, fiso: 2600 } },
        { date: '2026-01-08', results: { cmj: 40, x_salto_al_cajon: 55, fvv_banca: 0.71, fvkg_banca: 60 } },
    ], 'las fórmulas no cuentan')
})

test('cada hoja a su cliente', () => {
    const clients = [{ id: 'a', name: 'Ana Martínez López' }, { id: 'b', name: 'Bea Ruiz' }, { id: 'c', name: 'Ana Sanz' }]
    assert.equal(matchClient('ANA MARTINEZ', clients).id, 'a')
    assert.equal(matchClient('Bea', clients).id, 'b')
    assert.equal(matchClient('Ana', clients), null, 'dos Anas: que elija')
    assert.equal(matchClient('Carlos Pérez', clients), null)
})

/* ---------- un .xlsx de prueba ---------- */

function zip(entries) {
    const encoder = new TextEncoder()
    const locals = []
    const centrals = []
    let offset = 0
    for (const [name, text, deflate] of entries) {
        const nameBytes = encoder.encode(name)
        const raw = encoder.encode(text)
        const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw
        const local = new Uint8Array(30 + nameBytes.length + data.length)
        const lv = new DataView(local.buffer)
        lv.setUint32(0, 0x04034b50, true)
        lv.setUint16(8, deflate ? 8 : 0, true)
        lv.setUint32(18, data.length, true)
        lv.setUint32(22, raw.length, true)
        lv.setUint16(26, nameBytes.length, true)
        local.set(nameBytes, 30)
        local.set(data, 30 + nameBytes.length)
        const central = new Uint8Array(46 + nameBytes.length)
        const cv = new DataView(central.buffer)
        cv.setUint32(0, 0x02014b50, true)
        cv.setUint16(10, deflate ? 8 : 0, true)
        cv.setUint32(20, data.length, true)
        cv.setUint32(24, raw.length, true)
        cv.setUint16(28, nameBytes.length, true)
        cv.setUint32(42, offset, true)
        central.set(nameBytes, 46)
        locals.push(local)
        centrals.push(central)
        offset += local.length
    }
    const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0)
    const end = new Uint8Array(22)
    const ev = new DataView(end.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(8, entries.length, true)
    ev.setUint16(10, entries.length, true)
    ev.setUint32(12, centralSize, true)
    ev.setUint32(16, offset, true)
    const all = new Uint8Array(offset + centralSize + 22)
    let at = 0
    for (const part of [...locals, ...centrals, end]) { all.set(part, at); at += part.length }
    return all
}

test('leer un .xlsx: hojas, textos compartidos, números, fechas y fórmulas', async () => {
    const file = zip([
        ['xl/workbook.xml', '<workbook><sheets><sheet name="Ana &amp; co" sheetId="1" r:id="rId1"/><sheet name="Bea" sheetId="2" r:id="rId2"/></sheets></workbook>'],
        ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>'],
        ['xl/sharedStrings.xml', '<sst><si><t>CMJ</t></si><si><r><t>Ana </t></r><r><t xml:space="preserve">Martínez</t></r></si></sst>', true],
        ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="3"><c r="G3" t="s"><v>1</v></c></row><row r="6"><c r="I6" t="s"><v>0</v></c><c r="J6"><v>38.5</v></c><c r="K6"><f>J6*2</f><v>77</v></c><c r="L6" t="inlineStr"><is><t>texto</t></is></c><c r="M6" s="1"/></row></sheetData></worksheet>', true],
        ['xl/worksheets/sheet2.xml', '<worksheet><sheetData/></worksheet>'],
    ])
    const sheets = await readXlsx(file)
    assert.deepEqual(sheets.map(sheet => sheet.name), ['Ana & co', 'Bea'])
    const first = sheets[0]
    assert.deepEqual(first.cell(6, 3), { v: 'Ana Martínez', f: false })
    assert.deepEqual(first.cell(8, 6), { v: 'CMJ', f: false })
    assert.deepEqual(first.cell(9, 6), { v: 38.5, f: false })
    assert.deepEqual(first.cell(10, 6), { v: 77, f: true })
    assert.deepEqual(first.cell(11, 6), { v: 'texto', f: false })
    assert.equal(first.cell(12, 6), undefined, 'celda vacía')
    assert.equal(sheets[1].cell(0, 1), undefined)
})

test('referencias de celda', () => {
    assert.equal(columnName(0), 'A')
    assert.equal(columnName(25), 'Z')
    assert.equal(columnName(27), 'AB')
    assert.deepEqual(parseRef('AB12'), { column: 27, row: 12 })
    assert.equal(parseRef('12'), null)
    assert.equal(parseSheet('<c r="A1" t="e"><v>#N/A</v></c>').size, 0, 'los errores no cuentan')
})

test('resumen de un deportista', () => {
    const summary = evaluationSummary([
        { eval_date: '2026-11-01', results: { cmj: 42, cmj_r: 20, cmj_l: 25 } },
        { eval_date: null, results: { bj: 200 } },
        { eval_date: '2026-10-01', results: { cmj: 40, rsi: 2, fcmj: 2000, sqiso: 2500 } },
    ])
    assert.equal(summary.count, 3)
    assert.equal(summary.lastDate, '2026-11-01')
    assert.equal(summary.cmj.value, 42)
    assert.equal(summary.cmj.change, 5)
    assert.deepEqual(summary.rsi, { value: 2, change: null })
    assert.deepEqual(summary.bj, { value: 200, change: null })
    assert.equal(summary.dsi, 0.8)
    assert.equal(summary.asymmetry.base, 'cmj')
    assert.equal(Math.round(summary.score), Math.round(scores({ cmj: 42 }).total))
    assert.equal(evaluationSummary([]), null)
})
