/**
 * Evaluaciones de rendimiento: catálogo de tests (nombres de VALD), nota 0-100, asimetrías, comparar
 * dos fechas y lectura de la hoja de evaluaciones del Excel del centro. Sin dependencias.
 *
 * Los resultados de una evaluación son { clave: número }. Las claves de lado acaban en _l o _r.
 */

export const EVAL_GROUPS = [
    'Countermovement Jump', 'Drop Jump', 'Hop Test', 'Single Leg Jump', 'Single Leg Drop Jump',
    'Isometric Test', 'Broad Jump', 'Saltos', 'Velocidad y cambio de dirección', 'Fuerza',
    'Perfil fuerza-velocidad', 'Otros',
]

/** [nombre, unidad, sentido (1 más es mejor, -1 menos es mejor, 0 neutro), grupo] */
const FIXED = {
    cmj: ['CMJ · Max Jump Height (Imp-Dis)', 'cm', 1, 'Countermovement Jump'],
    rsimod: ['CMJ · Max RSI-modified (Imp-Mom)', 'm/s', 1, 'Countermovement Jump'],
    ecc: ['CMJ · Min Eccentric Peak Velocity', 'm/s', -1, 'Countermovement Jump'],
    fcmj: ['CMJ · Max Concentric Peak Force', 'N', 1, 'Countermovement Jump'],
    fcmj_asym: ['CMJ · Concentric Peak Force (asimetría)', '%', -1, 'Countermovement Jump'],
    ppbm: ['CMJ · Peak Power / BM', 'W/kg', 1, 'Countermovement Jump'],
    cmrj: ['CMRJ · Max First Jump Height (Imp-Mom)', 'cm', 1, 'Countermovement Jump'],
    rsi: ['DJ · Max RSI (JH (Flight Time)/Contact Time)', 'm/s', 1, 'Drop Jump'],
    hop: ['Hop Test · Avg Best RSI (Jump Height/Contact Time)', 'm/s', 1, 'Hop Test'],
    hopfat: ['Hop Test · Min RSI (Jump Height/Contact Time) Fatigue', '%', -1, 'Hop Test'],
    cmj_l: ['SLJ · Max Jump Height (Imp-Mom) Left', 'cm', 1, 'Single Leg Jump'],
    cmj_r: ['SLJ · Max Jump Height (Imp-Mom) Right', 'cm', 1, 'Single Leg Jump'],
    sljrsim_l: ['SLJ · Max RSI-modified Left', 'm/s', 1, 'Single Leg Jump'],
    sljrsim_r: ['SLJ · Max RSI-modified Right', 'm/s', 1, 'Single Leg Jump'],
    rsi_l: ['SLDJ · Max RSI (JH (Flight Time)/Contact Time) Left', 'm/s', 1, 'Single Leg Drop Jump'],
    rsi_r: ['SLDJ · Max RSI (JH (Flight Time)/Contact Time) Right', 'm/s', 1, 'Single Leg Drop Jump'],
    sldjh_l: ['SLDJ · Max Jump Height (Imp-Mom) Left', 'cm', 1, 'Single Leg Drop Jump'],
    sldjh_r: ['SLDJ · Max Jump Height (Imp-Mom) Right', 'cm', 1, 'Single Leg Drop Jump'],
    sldjct_l: ['SLDJ · Min Contact Time Left', 's', -1, 'Single Leg Drop Jump'],
    sldjct_r: ['SLDJ · Min Contact Time Right', 's', -1, 'Single Leg Drop Jump'],
    sqiso: ['ISOT · Max Peak Vertical Force', 'N', 1, 'Isometric Test'],
    sqiso_asym: ['ISOT · Peak Vertical Force (asimetría)', '%', -1, 'Isometric Test'],
    rfd: ['ISOT · Max RFD - 100ms', 'N/s', 1, 'Isometric Test'],
    rfd_asym: ['ISOT · RFD - 100ms (asimetría)', '%', -1, 'Isometric Test'],
    sqiso_l: ['SLISOT · Max Peak Vertical Force Left', 'N', 1, 'Isometric Test'],
    sqiso_r: ['SLISOT · Max Peak Vertical Force Right', 'N', 1, 'Isometric Test'],
    fiso: ['ISOT · Peak Force (Excel)', 'N', 1, 'Isometric Test'],
    bj: ['Broad Jump', 'cm', 1, 'Broad Jump'],
    bj_r: ['Broad Jump Right', 'cm', 1, 'Broad Jump'],
    bj_l: ['Broad Jump Left', 'cm', 1, 'Broad Jump'],
    rsicmj_r: ['RSI CMJ Right', '', 1, 'Otros'],
    rsicmj_l: ['RSI CMJ Left', '', 1, 'Otros'],
    tmov: ['Tiempo de movimiento', '', 0, 'Otros'],
    tvuelo: ['Tiempo de vuelo', '', 0, 'Otros'],
    rea: ['REAC (reacción)', 's', -1, 'Velocidad y cambio de dirección'],
}

/** Perfil fuerza-velocidad del Excel: [clave, nombre]. */
export const FV_EXERCISES = [
    ['banca', 'Press de banca'], ['remo', 'Remo barra'], ['militar', 'Press militar'], ['dominada', 'Dominada'],
    ['sentadilla', 'Sentadilla'], ['hipthrust', 'Hip thrust'], ['pmuerto', 'Peso muerto'],
]

/** Tests que salen siempre en la tabla de datos, en este orden. */
export const CORE_TESTS = [
    'cmj', 'rsimod', 'ecc', 'fcmj', 'fcmj_asym', 'rsi', 'hop', 'hopfat', 'cmj_l', 'cmj_r', 'sljrsim_l', 'sljrsim_r',
    'rsi_l', 'rsi_r', 'sldjh_l', 'sldjh_r', 'sldjct_l', 'sldjct_r', 'sqiso', 'sqiso_asym', 'rfd', 'rfd_asym',
    'bj', 'bj_r', 'bj_l', 'sp9_r', 'sp9_l', 'c405_r', 'c405_l',
]

const SIDE = { r: 'Right', l: 'Left' }

/**
 * Definición de un test.
 * @param {string} key
 * @param {{ custom?: Record<string, { name: string, unit?: string, direction?: number, group?: string }>, names?: Record<string, string> }} [context]
 * @returns {{ name: string, unit: string, direction: number, group: string }}
 */
export function testDef(key, context = {}) {
    const custom = context.custom?.[key]
    if (custom?.name) {
        return {
            name: custom.name,
            unit: custom.unit ?? '',
            direction: Number(custom.direction) || 0,
            group: EVAL_GROUPS.includes(custom.group ?? '') ? /** @type {string} */ (custom.group) : 'Otros',
        }
    }
    const fixed = FIXED[key]
    if (fixed) return { name: fixed[0], unit: fixed[1], direction: fixed[2], group: fixed[3] }
    let match
    if ((match = key.match(/^sp(\d+)(lat)?_(r|l)$/))) {
        return { name: `Sprint ${match[1]} m${match[2] ? ' lateral' : ''} ${SIDE[match[3]]}`, unit: 's', direction: -1, group: 'Velocidad y cambio de dirección' }
    }
    if ((match = key.match(/^c40(\d)_(r|l)$/))) {
        const name = match[1] === '5' ? '9 m ida y vuelta (4-5)' : `4-0-${match[1]}`
        return { name: `COD ${name} ${SIDE[match[2]]}`, unit: 's', direction: -1, group: 'Velocidad y cambio de dirección' }
    }
    if ((match = key.match(/^fv(kg|v)_(.+)$/))) {
        const exercise = FV_EXERCISES.find(entry => entry[0] === match[2])
        const isLoad = match[1] === 'kg'
        return {
            name: `${exercise ? exercise[1] : match[2]} · ${isLoad ? 'carga' : 'velocidad'}`,
            unit: isLoad ? 'kg' : 'm/s',
            direction: isLoad ? 0 : 1,
            group: 'Perfil fuerza-velocidad',
        }
    }
    return { name: context.names?.[key] ?? key.replace(/^x_/, '').replace(/_/g, ' '), unit: '', direction: 0, group: 'Otros' }
}

/* ---------- cálculos ---------- */

const value = (results, key) => (results && typeof results[key] === 'number' && Number.isFinite(results[key]) ? results[key] : null)
const clamp = x => Math.max(0, Math.min(100, x))
const average = list => {
    const present = list.filter(entry => entry !== null)
    return present.length ? present.reduce((sum, entry) => sum + entry, 0) / present.length : null
}

/** Fuerza isométrica: la del Excel o, si no, la de VALD. */
function isoForce(results) {
    const excel = value(results, 'fiso')
    return excel !== null ? excel : value(results, 'sqiso')
}

/** Índice DSI: fuerza máxima del CMJ entre fuerza isométrica máxima. */
export function dsi(results) {
    const cmj = value(results, 'fcmj')
    const iso = isoForce(results)
    return cmj !== null && iso ? cmj / iso : null
}

function sprint(results) {
    for (const distance of ['8', '9']) {
        const mean = average([value(results, `sp${distance}_r`), value(results, `sp${distance}_l`)])
        if (mean !== null) return mean
    }
    return null
}

function changeOfDirection(results) {
    for (const test of ['4', '5']) {
        const mean = average([value(results, `c40${test}_r`), value(results, `c40${test}_l`)])
        if (mean !== null) return mean
    }
    return null
}

/** Referencias de la nota 0-100 del centro. */
export const SCORE_REFERENCES = { CMJ: 'CMJ 55 cm', BJ: 'BJ 275 cm', RSI: 'RSI 3', ACC: 'ACC 1,6 s', COD: 'COD 3,2 s', REA: 'REA 8 s' }

/**
 * Nota de 0 a 100 de cada cualidad frente a las referencias del centro y la media de las que hay.
 * Un test sin dato no cuenta.
 */
export function scores(results) {
    const cmj = value(results, 'cmj')
    const broad = value(results, 'bj')
    const reactive = value(results, 'rsi')
    const acceleration = sprint(results)
    const cod = changeOfDirection(results)
    const reaction = value(results, 'rea')
    /** @type {Record<string, number | null>} */
    const each = {
        CMJ: cmj !== null ? clamp((cmj / 55) * 100) : null,
        BJ: broad !== null ? clamp((broad / 275) * 100) : null,
        RSI: reactive !== null ? clamp((reactive / 3) * 100) : null,
        ACC: acceleration !== null ? clamp(100 - ((acceleration - 1.6) / 1.6) * 100) : null,
        COD: cod !== null ? clamp(100 - ((cod - 3.2) / 1.6) * 100) : null,
        REA: reaction !== null ? clamp(100 - ((reaction - 8) / 4) * 100) : null,
    }
    const present = Object.values(each).filter(entry => entry !== null)
    return { each, total: present.length ? present.reduce((sum, entry) => sum + entry, 0) / present.length : null, count: present.length }
}

const ASYM_ORDER = ['cmj', 'bj', 'rsi', 'rsicmj', 'sp8', 'sp9', 'sp5', 'sp5lat', 'c404', 'c405']

/**
 * Asimetrías derecha/izquierda (|1 − der/izq|·100, como en el Excel) y las que ya vienen en %.
 * @returns {{ base: string, name: string, right: number | null, left: number | null, percent: number }[]}
 */
export function asymmetries(results, context = {}) {
    const keys = Object.keys(results ?? {})
    const bases = new Set(keys.filter(key => /_(r|l)$/.test(key)).map(key => key.replace(/_(r|l)$/, '')))
    const ordered = [...ASYM_ORDER.filter(base => bases.has(base)), ...[...bases].filter(base => !ASYM_ORDER.includes(base)).sort()]
    const out = []
    for (const base of ordered) {
        const right = value(results, `${base}_r`)
        const left = value(results, `${base}_l`)
        if (right === null || !left) continue
        out.push({ base, name: testDef(`${base}_r`, context).name.replace(/ Right$/, ''), right, left, percent: Math.abs(1 - right / left) * 100 })
    }
    for (const key of keys.filter(entry => /_asym$/.test(entry)).sort()) {
        const percent = value(results, key)
        if (percent !== null) out.push({ base: key, name: testDef(key, context).name.replace(/ \(asimetría\)$/, ''), right: null, left: null, percent })
    }
    return out
}

/** Nivel de una asimetría: menos del 10 % bien, hasta el 15 % vigilar, más alta. */
export function asymmetryLevel(percent) {
    return percent < 10 ? 'ok' : percent < 15 ? 'watch' : 'high'
}

/**
 * Comparar dos evaluaciones: cada test con valor en alguna, el cambio en % y si es a mejor.
 * @param {Record<string, number>} before
 * @param {Record<string, number>} after
 */
export function compareResults(before, after, context = {}) {
    const keys = sortTests([...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])], context)
    return keys.map(key => {
        const a = value(before, key)
        const b = value(after, key)
        const def = testDef(key, context)
        const change = a !== null && b !== null && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null
        const better = change === null || def.direction === 0 || change === 0 ? null : change * def.direction > 0
        return { key, ...def, before: a, after: b, change, better }
    })
}

/** Tests ordenados por grupo y, dentro, como en el núcleo; los del perfil fuerza-velocidad al final. */
export function sortTests(keys, context = {}) {
    const position = key => {
        const core = CORE_TESTS.indexOf(key)
        if (core >= 0) return core
        const fv = key.match(/^fv(kg|v)_(.+)$/)
        if (fv) return 100 + FV_EXERCISES.findIndex(entry => entry[0] === fv[2]) * 2 + (fv[1] === 'v' ? 1 : 0)
        return 50
    }
    return [...keys].sort((a, b) =>
        EVAL_GROUPS.indexOf(testDef(a, context).group) - EVAL_GROUPS.indexOf(testDef(b, context).group)
        || position(a) - position(b)
        || a.localeCompare(b))
}

/**
 * Tests de la tabla de datos: los del núcleo y los propios (menos los ocultos) y cualquiera con datos.
 * @param {{ results: Record<string, number> }[]} evaluations
 * @param {{ custom?: Record<string, any>, hidden?: Set<string> | string[], names?: Record<string, string> }} context
 */
export function tableTests(evaluations, context = {}) {
    const hidden = new Set(context.hidden ?? [])
    const keys = new Set(CORE_TESTS.filter(key => !hidden.has(key)))
    for (const key of Object.keys(context.custom ?? {})) if (!hidden.has(key)) keys.add(key)
    for (const evaluation of evaluations) {
        for (const key of Object.keys(evaluation.results ?? {})) if (!/^fv(kg|v)_/.test(key)) keys.add(key)
    }
    return sortTests([...keys], context)
}

/** Número con los decimales de su unidad: N y N/s sin decimales y con puntos de miles; cm, kg y % con uno. */
export function formatResult(x, key, context = {}) {
    if (x === null || x === undefined || !Number.isFinite(Number(x))) return ''
    const unit = testDef(key, context).unit
    const decimals = unit === 'N' || unit === 'N/s' ? 0 : unit === 'cm' || unit === 'kg' || unit === '%' ? 1 : unit === 's' && /ct_/.test(key) ? 3 : 2
    let text = (Math.round(Number(x) * 10 ** decimals) / 10 ** decimals).toFixed(decimals)
    if (decimals === 1) text = text.replace(/\.0$/, '')
    text = text.replace('.', ',')
    return unit === 'N' || unit === 'N/s' ? text.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : text
}

/** «+4,2 %». */
export function formatChange(change) {
    if (change === null || change === undefined) return ''
    const rounded = Math.round(change * 10) / 10
    return `${rounded > 0 ? '+' : ''}${String(rounded).replace('.', ',')} %`
}

/* ---------- la hoja de evaluaciones del Excel (CLUB COMBINE) ---------- */

const fold = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const slug = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50)
const side = word => (word[0] === 'D' ? 'r' : 'l')

/** Clave de un test a partir de la etiqueta de su fila en el Excel. */
export function keyOfLabel(label, row) {
    const text = fold(label)
    let match
    if (row === 26) return 'tmov'
    if (/^TIEMPO (DE )?VUELO/.test(text)) return 'tvuelo'
    if (/^TIEMPO (DE )?MOVIMIENTO/.test(text)) return 'tmov'
    const fixed = {
        CMJ: 'cmj', 'BROAD JUMP': 'bj', 'BJ DCH': 'bj_r', 'BJ DCHA': 'bj_r', 'BJ IZQ': 'bj_l', RSI: 'rsi', 'RSI DCH': 'rsi_r',
        'RSI DCHA': 'rsi_r', 'RSI IZQ': 'rsi_l', REAC: 'rea', REA: 'rea', 'RSI MOD': 'rsimod', 'SQ ISO MAX': 'sqiso',
    }
    if (fixed[text]) return fixed[text]
    if ((match = text.match(/^CMJ (DCHA?|IZQ?|IZ)$/))) return `cmj_${side(match[1])}`
    if ((match = text.match(/^RSI CMJ (DCHA?|IZQ?|IZ)$/))) return `rsicmj_${side(match[1])}`
    if ((match = text.match(/^(\d+) ?M (LAT )?(DCHA?|IZQ?|IZ)$/))) return `sp${match[1]}${match[2] ? 'lat' : ''}_${side(match[3])}`
    if ((match = text.match(/^4-0-(\d) (DCHA?|IZQ?|IZ)$/))) return `c40${match[1]}_${side(match[2])}`
    if (/^TEST ESPECIF/.test(text)) return `x_fila${row}`
    return `x_${slug(label) || `fila${row}`}`
}

/** Fecha de una celda: número de serie de Excel o texto AAAA-MM-DD. */
export function cellDate(raw) {
    if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
        return new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000).toISOString().slice(0, 10)
    }
    return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : ''
}

function cellNumber(raw) {
    if (raw === undefined || raw === null || raw === '') return null
    const number = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.').trim())
    return Number.isFinite(number) ? number : null
}

/**
 * Lee una hoja de evaluaciones. `cell(columna desde 0, fila desde 1)` da { v, f } (f: es fórmula).
 * Solo cuentan los valores escritos a mano: las fórmulas se recalculan aquí.
 * @param {(column: number, row: number) => ({ v: any, f?: boolean } | undefined)} cell
 * @param {string} sheetName
 */
export function parseEvalSheet(cell, sheetName) {
    const typed = (column, row) => {
        const entry = cell(column, row)
        return entry && !entry.f ? entry.v : undefined
    }
    const athlete = String(typed(6, 3) ?? sheetName ?? '').trim()
    /** @type {Record<string, string | number>} */
    const info = {}
    for (const [key, column, row] of [['deporte', 6, 5], ['posicion', 6, 7], ['edad', 6, 9], ['peso', 6, 11], ['altura', 6, 13], ['pierna', 6, 15], ['altura90', 6, 17], ['palanca', 6, 19]]) {
        const raw = typed(column, row)
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') info[key] = typeof raw === 'number' ? raw : String(raw).trim()
    }

    /** @type {Map<string, { date: string, results: Record<string, number> }>} */
    const dates = new Map()
    /** @type {Record<string, string>} */
    const names = {}
    const bucket = (date, index) => {
        const key = date || `sin-fecha-${index + 1}`
        if (!dates.has(key)) dates.set(key, { date, results: {} })
        return /** @type {{ date: string, results: Record<string, number> }} */ (dates.get(key))
    }

    const top = [9, 10, 11, 12, 13].map(column => cellDate(typed(column, 5)))
    for (let row = 6; row <= 35; row++) {
        const labelCell = cell(8, row)
        if (!labelCell || labelCell.v === undefined || labelCell.v === '' || labelCell.v === null) continue
        const label = String(labelCell.v)
        const key = keyOfLabel(label, row)
        if (key.startsWith('x_')) names[key] = label.trim() || `Fila ${row}`
        for (let index = 0; index < 5; index++) {
            const number = cellNumber(typed(9 + index, row))
            if (number !== null) bucket(top[index], index).results[key] = number
        }
    }

    const dsiDates = [3, 4, 5, 6, 7].map(column => cellDate(typed(column, 56)))
    for (let index = 0; index < 5; index++) {
        const cmjForce = cellNumber(typed(3 + index, 58))
        const isoPeak = cellNumber(typed(3 + index, 60))
        if (cmjForce !== null) bucket(dsiDates[index] || top[index], index).results.fcmj = cmjForce
        if (isoPeak !== null) bucket(dsiDates[index] || top[index], index).results.fiso = isoPeak
    }

    const fvDates = [3, 4, 5, 6, 7].map(column => cellDate(typed(column, 38)))
    FV_EXERCISES.forEach(([key], position) => {
        const row = 40 + position * 2
        const load = cellNumber(typed(2, row))
        for (let index = 0; index < 5; index++) {
            const speed = cellNumber(typed(3 + index, row))
            if (speed === null) continue
            const target = bucket(fvDates[index] || top[index], index)
            target.results[`fvv_${key}`] = speed
            if (load !== null) target.results[`fvkg_${key}`] = load
        }
    })

    return {
        sheet: sheetName,
        athlete,
        info,
        names,
        dates: [...dates.values()].filter(entry => Object.keys(entry.results).length > 0),
    }
}

/**
 * Cliente de una hoja: todas las palabras de uno están en el otro (dos o más, o un nombre de una palabra).
 * Si dos clientes encajan igual de bien, ninguno.
 * @param {string} name
 * @param {{ id: string, name: string }[]} clients
 */
export function matchClient(name, clients) {
    const words = text => fold(text).split(/[^A-Z0-9Ñ]+/).filter(word => word.length > 1)
    const wanted = words(name)
    if (wanted.length === 0) return null
    let best = null
    let bestScore = 0
    let tied = false
    for (const client of clients) {
        const own = words(client.name)
        if (own.length === 0) continue
        const hits = wanted.filter(word => own.includes(word)).length
        const ok = hits === wanted.length || hits === own.length
        const score = ok ? hits + (hits === wanted.length && hits === own.length ? 1 : 0) : 0
        if (!(score > 0 && (hits >= 2 || wanted.length === 1 || own.length === 1))) continue
        if (score > bestScore) {
            bestScore = score
            best = client
            tied = false
        } else if (score === bestScore) {
            tied = true
        }
    }
    // Con un empate no se adivina: que elija quien importa.
    return tied ? null : best
}

/** Evaluaciones en orden: las de fecha por fecha y las sin fecha al principio, como llegaron. */
export function sortEvaluations(evaluations) {
    return [...evaluations].sort((a, b) => (a.eval_date ?? '').localeCompare(b.eval_date ?? '') || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
}

/**
 * Resumen de un deportista para la tabla de todas las evaluaciones: cuántas, la última fecha, la última
 * nota, el último CMJ, BJ y RSI con su cambio desde el primero, el DSI y la asimetría más alta.
 * @param {{ eval_date: string | null, results: Record<string, number>, created_at?: string }[]} evaluations
 */
export function evaluationSummary(evaluations, context = {}) {
    const list = sortEvaluations(evaluations)
    if (list.length === 0) return null
    const last = pick => {
        for (let index = list.length - 1; index >= 0; index--) {
            const found = pick(list[index].results ?? {})
            if (found !== null && found !== undefined) return found
        }
        return null
    }
    const first = pick => {
        for (const evaluation of list) {
            const found = pick(evaluation.results ?? {})
            if (found !== null && found !== undefined) return found
        }
        return null
    }
    const test = key => {
        const latest = last(results => value(results, key))
        const earliest = first(results => value(results, key))
        const count = list.filter(evaluation => value(evaluation.results, key) !== null).length
        return latest === null ? null : {
            value: latest,
            change: count > 1 && earliest ? ((latest - earliest) / Math.abs(earliest)) * 100 : null,
        }
    }
    const dated = list.filter(evaluation => evaluation.eval_date)
    return {
        count: list.length,
        lastDate: dated.length ? dated[dated.length - 1].eval_date : null,
        score: last(results => scores(results).total),
        cmj: test('cmj'),
        bj: test('bj'),
        rsi: test('rsi'),
        dsi: last(results => dsi(results)),
        asymmetry: last(results => {
            const all = asymmetries(results, context)
            return all.length ? all.reduce((max, entry) => (entry.percent > max.percent ? entry : max)) : null
        }),
    }
}
