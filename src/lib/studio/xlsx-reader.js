/**
 * Lector mínimo de .xlsx para importar evaluaciones, sin librerías: un .xlsx es un zip con XML.
 * Funciona en el navegador y en Node 18+ (usa DecompressionStream, Blob y Response).
 * Solo lee valores: de cada celda dice si es una fórmula para poder ignorarla.
 */

const decoder = new TextDecoder('utf-8')

/** «A» es la columna 0. */
export function columnName(index) {
    let name = ''
    let n = index + 1
    while (n > 0) {
        const rest = (n - 1) % 26
        name = String.fromCharCode(65 + rest) + name
        n = Math.floor((n - 1) / 26)
    }
    return name
}

/** «AB12» → { column: 27, row: 12 }. */
export function parseRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(ref ?? ''))
    if (!match) return null
    let column = 0
    for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64)
    return { column: column - 1, row: Number(match[2]) }
}

export function decodeXml(text) {
    return String(text ?? '')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
}

const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(match => [match[1], decodeXml(match[2])]))

/** Texto de un trozo con <t>, juntando los tramos de texto enriquecido. */
const textOf = xml => [...String(xml ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1])).join('')

export function parseSharedStrings(xml) {
    return [...String(xml ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => textOf(match[1]))
}

/** Hojas del libro, en orden, con la ruta de su XML dentro del zip. */
export function parseWorkbook(workbookXml, relsXml) {
    const targets = new Map()
    for (const match of String(relsXml ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
        const rel = attributes(match[0])
        if (rel.Id && rel.Target) targets.set(rel.Id, rel.Target)
    }
    return [...String(workbookXml ?? '').matchAll(/<sheet\b[^>]*>/g)].map(match => {
        const sheet = attributes(match[0])
        const target = targets.get(sheet['r:id']) ?? ''
        const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
        return { name: sheet.name ?? '', path }
    }).filter(sheet => sheet.path !== 'xl/')
}

/**
 * Celdas de una hoja: { referencia: { v, f } }.
 * @returns {Map<string, { v: string | number | boolean, f: boolean }>}
 */
export function parseSheet(xml, shared = []) {
    const cells = new Map()
    for (const match of String(xml ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = attributes(match[1])
        const inner = match[2] ?? ''
        if (!attrs.r) continue
        const formula = /<f\b/.test(inner)
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        let v
        if (attrs.t === 's') v = raw === undefined ? undefined : shared[Number(raw)]
        else if (attrs.t === 'inlineStr') v = textOf(inner)
        else if (attrs.t === 'str') v = raw === undefined ? undefined : decodeXml(raw)
        else if (attrs.t === 'b') v = raw === '1'
        else if (attrs.t === 'e') v = undefined
        else v = raw === undefined ? undefined : Number(raw)
        if (v === undefined || (typeof v === 'number' && Number.isNaN(v))) continue
        cells.set(attrs.r, { v, f: formula })
    }
    return cells
}

async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Archivos de un zip (solo los que pide `wanted`, si se da).
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {(name: string) => boolean} [wanted]
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function unzip(buffer, wanted = () => true) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let end = -1
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
    }
    if (end < 0) throw new Error('No es un archivo .xlsx')
    const count = view.getUint16(end + 10, true)
    let offset = view.getUint32(end + 16, true)
    const files = new Map()
    for (let k = 0; k < count; k++) {
        if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('El archivo está dañado')
        const method = view.getUint16(offset + 10, true)
        const size = view.getUint32(offset + 20, true)
        const nameLength = view.getUint16(offset + 28, true)
        const extraLength = view.getUint16(offset + 30, true)
        const commentLength = view.getUint16(offset + 32, true)
        const local = view.getUint32(offset + 42, true)
        const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
        offset += 46 + nameLength + extraLength + commentLength
        if (!wanted(name)) continue
        const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
        const data = bytes.subarray(dataStart, dataStart + size)
        if (method === 0) files.set(name, data)
        else if (method === 8) files.set(name, await inflate(data))
        else throw new Error('El archivo usa una compresión que no se puede leer')
    }
    return files
}

/**
 * Hojas de un .xlsx con un lector de celdas por columna (desde 0) y fila (desde 1).
 * @param {ArrayBuffer | Uint8Array} buffer
 */
export async function readXlsx(buffer) {
    const files = await unzip(buffer, name => name.startsWith('xl/') && name.endsWith('.xml') || name.endsWith('.rels'))
    const text = name => (files.has(name) ? decoder.decode(files.get(name)) : '')
    const shared = parseSharedStrings(text('xl/sharedStrings.xml'))
    return parseWorkbook(text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels')).map(sheet => {
        const cells = parseSheet(text(sheet.path), shared)
        return {
            name: sheet.name,
            /** @param {number} column @param {number} row */
            cell: (column, row) => cells.get(`${columnName(column)}${row}`),
        }
    })
}
