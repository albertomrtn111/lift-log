/**
 * Series de My Jump Lab: leer el CSV de la trayectoria de la barra y decidir a quién y a qué ejercicio va.
 * Sin dependencias para poder probarlo con node --test.
 */

const round2 = value => Math.round(value * 100) / 100

/**
 * Nombre del archivo que exporta My Jump: «Nombre_Apellido__Ejercicio-8rep_60.0kg.csv».
 * @param {string} fileName
 * @returns {{ who: string, exercise: string, reps: number | null, loadKg: number | null }}
 */
export function parseMyJumpName(fileName) {
    const base = String(fileName ?? '').replace(/\.csv$/i, '')
    const match = base.match(/^(.*?)__(.*?)-(\d+)rep_([\d.,]+)kg/i)
    if (!match) return { who: '', exercise: base.replace(/_/g, ' ').trim(), reps: null, loadKg: null }
    const load = Number.parseFloat(match[4].replace(',', '.'))
    return {
        who: match[1].replace(/_/g, ' ').trim(),
        exercise: match[2].replace(/_/g, ' ').trim(),
        reps: Number(match[3]),
        loadKg: load > 0 ? load : null,
    }
}

/**
 * Repeticiones de la serie a partir del CSV (columnas separadas por «;»: tiempo en la 1.ª, altura en la 3.ª
 * y velocidad en la 7.ª). Cada repetición con velocidad media (mv), media propulsiva (mpv), pico (pv)
 * y recorrido en cm. La mejor es la de más VMP; la pérdida compara la mejor con la última.
 * @param {string} text
 */
export function analyzeMyJump(text) {
    const rows = String(text ?? '')
        .replace(/^﻿/, '')
        .split(/\r?\n/)
        .slice(1)
        .map(line => line.split(';').map(cell => Number.parseFloat(String(cell).replace(',', '.'))))
        .filter(row => row.length >= 7 && row.every(cell => !Number.isNaN(cell)))
    const t = rows.map(row => row[0])
    const y = rows.map(row => row[2])
    const v = rows.map(row => row[6])
    const n = rows.length

    const candidates = []
    let i = 0
    while (i < n - 1) {
        if (v[i] > 0.08) {
            let start = i
            while (start > 0 && v[start - 1] > 0.03) start--
            let end = i
            while (end < n - 1 && v[end] > 0) end++
            candidates.push({ start, end, rise: y[end] - y[start] })
            i = end + 1
        } else {
            i++
        }
    }

    const maxRise = Math.max(0, ...candidates.map(candidate => candidate.rise))
    const reps = candidates
        .filter(candidate => candidate.rise > Math.max(0.08, maxRise * 0.5))
        .map(({ start, end, rise }) => {
            let peak = start
            for (let q = start; q <= end; q++) if (v[q] > v[peak]) peak = q
            // La fase propulsiva acaba cuando la barra frena más rápido que la gravedad.
            let propulsiveEnd = end
            for (let q = peak; q < end; q++) {
                if ((v[q + 1] - v[q]) / (t[q + 1] - t[q]) < -9.81) {
                    propulsiveEnd = q
                    break
                }
            }
            return {
                mv: round2(rise / (t[end] - t[start])),
                mpv: round2((y[propulsiveEnd] - y[start]) / Math.max(0.01, t[propulsiveEnd] - t[start])),
                pv: round2(v[peak]),
                rom: Math.round(rise * 100),
            }
        })
    if (reps.length === 0) return null

    let best = 0
    reps.forEach((rep, index) => { if (rep.mpv > reps[best].mpv) best = index })
    const last = reps[reps.length - 1]
    return {
        reps,
        best,
        mpv: reps[best].mpv,
        mv: reps[best].mv,
        loss: Math.max(0, Math.round(((reps[best].mpv - last.mpv) / reps[best].mpv) * 100)),
    }
}

/** La velocidad de una serie según la ecuación del ejercicio: VM si es de VM; si no, VMP. */
export function setVelocity(equation, analysis) {
    if (!analysis) return null
    return equation?.velocity_type === 'mv' ? (analysis.mv || analysis.mpv) : analysis.mpv
}

const decimal = value => (value === null || value === undefined ? '' : String(value).replace('.', ','))

/**
 * Filas de «Por series» con lo importado: carga, repeticiones, velocidad de la mejor repetición
 * y las repeticiones medidas. Solo las series con repeticiones.
 * @param {{ loadKg: number | null, analysis: any }[]} sets
 * @param {any} equation
 */
export function myJumpRows(sets, equation) {
    return sets
        .filter(set => set.analysis?.reps?.length)
        .map(set => ({
            loadKg: set.loadKg ? decimal(set.loadKg) : '',
            reps: String(set.analysis.reps.length),
            timeSeconds: '',
            rir: '',
            rpe: '',
            velocityMs: setVelocity(equation, set.analysis).toFixed(2).replace('.', ','),
            repDetail: set.analysis.reps,
            source: 'my_jump',
        }))
}

/**
 * Lo que va a la celda con las series importadas: series, repeticiones, carga y la velocidad
 * de la serie más pesada (con empate de carga, la más rápida).
 * @param {{ loadKg: string, reps: string, velocityMs: string }[]} rows
 */
export function myJumpCell(rows) {
    if (rows.length === 0) return null
    const number = text => Number.parseFloat(String(text ?? '').replace(',', '.')) || 0
    const top = rows.reduce((best, row) => (
        number(row.loadKg) > number(best.loadKg)
        || (number(row.loadKg) === number(best.loadKg) && number(row.velocityMs) > number(best.velocityMs))
            ? row
            : best
    ))
    const reps = [...new Set(rows.map(row => row.reps))]
    const loads = [...new Set(rows.map(row => row.loadKg).filter(Boolean))]
    return {
        sets: String(rows.length),
        reps: reps.length === 1 ? reps[0] : rows.map(row => row.reps).join('/'),
        loadKg: loads.length === 1 ? loads[0] : top.loadKg,
        velocityMs: top.velocityMs,
    }
}

/* ---------- a quién y a qué ejercicio va cada archivo ---------- */

/** Minúsculas, sin tildes ni signos. */
export function nameKey(text) {
    return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ]/g, '')
}

function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
    for (let j = 1; j <= b.length; j++) d[0][j] = j
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        }
    }
    return d[a.length][b.length]
}

/** Palabras del nombre: «Pablo_Berrogai_n» da [pablo, berrogain] (My Jump parte las tildes). */
function tokens(text) {
    const out = []
    for (const part of String(text ?? '').split(/[_\s]+/).filter(Boolean)) {
        if (/\d/.test(part)) {
            out.push('#')
            continue
        }
        const key = nameKey(part)
        if (!key) continue
        if (key.length <= 2 && out.length && out[out.length - 1] !== '#') out[out.length - 1] += key
        else out.push(key)
    }
    return out.filter(token => token !== '#')
}

const fileWords = fileName => tokens(String(fileName ?? '').replace(/\.csv$/i, '').replace(/[-.,()]+/g, '_'))
const similar = (word, other) => word === other
    || (word.length >= 4 && other.length >= 4 && (other.startsWith(word) || word.startsWith(other)))
    || (word.length >= 5 && distance(other, word) <= 1)

/**
 * Clientes que aparecen en el nombre del archivo, el más probable primero.
 * @param {string} fileName
 * @param {{ id: string, name: string }[]} clients
 */
export function clientCandidates(fileName, clients) {
    const words = fileWords(fileName)
    if (words.length === 0) return []
    const flat = words.join('')
    const score = part => {
        let best = 0
        for (const word of words) {
            if (word === part) best = Math.max(best, 3)
            else if (similar(part, word)) best = Math.max(best, 2)
        }
        if (!best && part.length >= 5 && flat.includes(part)) best = 2
        return best
    }
    return clients
        .map(client => {
            const parts = String(client.name ?? '').split(/\s+/).map(nameKey).filter(part => part.length >= 2)
            const scores = parts.map(score)
            const hits = scores.filter(Boolean).length
            return { client, hits, score: scores.reduce((sum, value) => sum + value, 0) + (scores[0] ? 1 : 0), first: Boolean(scores[0]) }
        })
        .filter(entry => entry.hits >= 2 || (entry.hits === 1 && entry.first))
        .sort((a, b) => b.hits - a.hits || b.score - a.score)
}

/** El cliente si no hay duda: nombre y apellido, o solo el nombre si nadie más se llama así. */
export function guessClient(fileName, clients) {
    const found = clientCandidates(fileName, clients)
    if (found.length === 0) return null
    if (found[0].hits < 2) return found.length === 1 ? found[0].client : null
    if (found.length > 1 && found[1].hits === found[0].hits && found[1].score === found[0].score) return null
    return found[0].client
}

const STOP_WORDS = new Set(['con', 'de', 'del', 'la', 'el', 'en', 'a', 'y', 'al', 'los', 'las', 'rep', 'reps', 'kg', 'csv', 'serie'])

/** Abreviaturas habituales al nombrar las series. */
const ALIASES = {
    ht: ['hip', 'thrust'], pm: ['peso', 'muerto'], pmr: ['peso', 'muerto', 'rumano'], rdl: ['peso', 'muerto', 'rumano'],
    sq: ['sentadilla'], squat: ['sentadilla'], bs: ['sentadilla', 'barra'], pb: ['press', 'banca'], bp: ['press', 'banca'],
    bench: ['press', 'banca'], deadlift: ['peso', 'muerto'], dl: ['peso', 'muerto'], row: ['remo'], ohp: ['press', 'militar'],
}

/**
 * Ejercicios de la biblioteca cuyas palabras están en el nombre del archivo, el más probable primero.
 * `full` dice si están todas sus palabras.
 * @param {string} fileName
 * @param {{ catalogExerciseId: string, name: string }[]} entries
 * @param {string} [clientName]
 */
export function exerciseCandidates(fileName, entries, clientName = '') {
    const own = new Set(String(clientName).split(/\s+/).map(nameKey))
    const base = String(fileName ?? '').replace(/\.csv$/i, '')
    const plain = base.split(/[_\s\-.,()]+/).map(nameKey).filter(Boolean)
        .flatMap(word => (ALIASES[word] ? ALIASES[word] : [word]))
    const words = [...new Set([
        ...fileWords(base).filter(word => !STOP_WORDS.has(word) && !own.has(word)),
        ...plain.filter(word => !STOP_WORDS.has(word) && !own.has(word) && word.length >= 2),
    ])]
    if (words.length === 0) return []
    return entries
        .map(entry => {
            const parts = String(entry.name ?? '').split(/[\s\-–/()]+/).map(nameKey).filter(part => part && !STOP_WORDS.has(part))
            const hits = parts.filter(part => words.some(word => similar(part, word))).length
            const used = words.filter(word => parts.some(part => similar(part, word))).length
            return {
                entry,
                hits,
                full: parts.length > 0 && hits === parts.length,
                score: hits * 10 + used * 3 - (parts.length - hits) * 4 - parts.length,
            }
        })
        .filter(candidate => candidate.hits > 0)
        .sort((a, b) => Number(b.full) - Number(a.full) || b.score - a.score)
}

/** El ejercicio si no hay duda: el único con todas sus palabras en el nombre. */
export function guessExercise(fileName, entries, clientName = '') {
    const found = exerciseCandidates(fileName, entries, clientName)
    if (found.length === 0 || !found[0].full) return null
    if (found[1]?.full && found[1].score === found[0].score) return null
    return found[0].entry
}

/** Fecha local del archivo, AAAA-MM-DD. */
export function fileDate(lastModified, timeZone = 'Europe/Madrid') {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(lastModified))
}

const measure = value => {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 && number < 100 ? round2(number) : 0
}

/**
 * Repeticiones que llegan de fuera, limpias: solo números creíbles y como mucho 60.
 * Devuelve el análisis de la serie o null si no queda ninguna con VMP.
 * @param {any} reps
 */
export function cleanAnalysis(reps) {
    if (!Array.isArray(reps)) return null
    const clean = reps.slice(0, 60)
        .map(rep => ({ mpv: measure(rep?.mpv), mv: measure(rep?.mv), pv: measure(rep?.pv), rom: Math.round(measure(rep?.rom)) }))
        .filter(rep => rep.mpv > 0)
        .map(rep => ({ ...rep, mv: rep.mv || rep.mpv }))
    if (clean.length === 0) return null
    let best = 0
    clean.forEach((rep, index) => { if (rep.mpv > clean[best].mpv) best = index })
    const last = clean[clean.length - 1]
    return {
        reps: clean,
        best,
        mpv: clean[best].mpv,
        mv: clean[best].mv,
        loss: Math.max(0, Math.round(((clean[best].mpv - last.mpv) / clean[best].mpv) * 100)),
    }
}

/** «Pablo Berrogai n» como lo escribe My Jump, legible: «Pablo Berrogain». */
export function readableName(who) {
    return tokens(who).map(word => word.charAt(0).toLocaleUpperCase('es') + word.slice(1)).join(' ')
}
