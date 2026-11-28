// Lecturas completas desde Supabase (NXT-153).
//
// PostgREST devuelve como mucho 1.000 filas por consulta y corta el resto sin avisar,
// también con la clave de servicio. Cualquier lectura que pueda pasar de ahí (todas las
// métricas de un coach, todos los mensajes, todos los suplementos activos…) se pide por
// páginas con estas funciones.
//
// Para que las páginas no se solapen ni se salten filas, la consulta tiene que ir
// ordenada por algo único: añade siempre `.order('id')` como último criterio.
//
// Puro, para node --test.

export const PAGE_SIZE = 1000

/** Tope de seguridad: 200 páginas son 200.000 filas. */
const MAX_PAGES = 200

/** Ids por petición en los `.in(...)`: con cientos de uuid la dirección se hace demasiado larga. */
export const IN_CHUNK_SIZE = 150

/**
 * Pide todas las filas de una consulta, página a página.
 *
 * Devuelve la misma forma que Supabase (`{ data, error }`) para no cambiar las
 * comprobaciones de quien llama. Si una página falla, `data` es null y `error` el fallo.
 *
 * @template T
 * @param {(from: number, to: number) => PromiseLike<{ data: T[] | null, error: any }>} fetchPage
 *   Recibe el rango (incluidos los dos extremos) y devuelve la consulta con `.range(from, to)`.
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 * @returns {Promise<{ data: T[] | null, error: any }>}
 */
export async function fetchAllPages(fetchPage, options = {}) {
    const pageSize = options.pageSize ?? PAGE_SIZE
    const maxPages = options.maxPages ?? MAX_PAGES
    /** @type {T[]} */
    const rows = []
    for (let page = 0; page < maxPages; page += 1) {
        const from = page * pageSize
        const { data, error } = await fetchPage(from, from + pageSize - 1)
        if (error) return { data: null, error }
        const batch = data ?? []
        rows.push(...batch)
        if (batch.length < pageSize) return { data: rows, error: null }
    }
    return {
        data: null,
        error: { message: `Lectura demasiado grande: más de ${maxPages * pageSize} filas` },
    }
}

/**
 * Parte una lista en trozos.
 * @template T
 * @param {readonly T[]} items
 * @param {number} [size]
 * @returns {T[][]}
 */
export function chunkList(items, size = IN_CHUNK_SIZE) {
    if (size < 1) throw new Error('chunkList: el tamaño tiene que ser al menos 1')
    /** @type {T[][]} */
    const chunks = []
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
    return chunks
}

/**
 * Pide todas las filas de una consulta con `.in(columna, ids)` cuando la lista de ids
 * puede ser larga: la parte en trozos y pagina cada trozo. Las filas salen en el orden
 * de los trozos, no en el orden global de la consulta: si importa, ordena después.
 *
 * @template T
 * @param {readonly string[]} ids
 * @param {(idsChunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null, error: any }>} fetchPage
 * @param {{ chunkSize?: number, pageSize?: number, maxPages?: number }} [options]
 * @returns {Promise<{ data: T[] | null, error: any }>}
 */
export async function fetchAllPagesIn(ids, fetchPage, options = {}) {
    /** @type {T[]} */
    const rows = []
    for (const idsChunk of chunkList(ids, options.chunkSize ?? IN_CHUNK_SIZE)) {
        const result = await fetchAllPages((from, to) => fetchPage(idsChunk, from, to), options)
        if (result.error) return { data: null, error: result.error }
        rows.push(...(result.data ?? []))
    }
    return { data: rows, error: null }
}
