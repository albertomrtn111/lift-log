// Motor de facturación: decide qué debe cobrarse cada mes y en qué estado
// está, a partir de los atletas y de los registros guardados. Es puro (sin
// base de datos ni fechas implícitas) para poder probarlo y reutilizarlo en
// servidor y cliente.
//
// Reglas:
// - Un atleta es facturable en un mes si está activo, tiene cuota > 0 y su
//   alta (start_date, o la fecha de creación) es anterior o igual a ese mes.
// - Los meses futuros no se facturan todavía: solo cuentan como previsión.
// - Un registro existente siempre manda (aunque el atleta ya esté inactivo
//   o haya cambiado de cuota).
// - Si un atleta facturable no tiene registro ese mes, aparece como «sin
//   registrar» para que el coach decida (cobrar, eximir…). Nunca se crean
//   deudas automáticamente en meses pasados.
// - Un pendiente pasa a vencido cuando se supera su día de cobro.

export type RecordStatus = 'pending' | 'paid' | 'overdue' | 'waived'
export type RowState = RecordStatus | 'missing'

export interface LedgerClient {
    id: string
    full_name: string | null
    email: string | null
    status: string
    start_date: string | null
    created_at: string | null
    payment_amount: number | string | null
    payment_day: number | null
}

export interface LedgerRecord {
    id: string
    client_id: string
    year: number
    month: number
    amount: number | string
    status: RecordStatus
    paid_at: string | null
    payment_method: string | null
    notes: string | null
}

export interface MonthRow {
    key: string
    clientId: string
    name: string
    email: string
    clientActive: boolean
    amount: number
    state: RowState
    dueDate: string
    /** Días de retraso respecto al día de cobro (solo pendientes/vencidos) */
    daysLate: number
    record: LedgerRecord | null
}

export interface MonthSummary {
    expected: number
    collected: number
    pending: number
    overdue: number
    missing: number
    waived: number
    counts: Record<RowState, number>
}

export interface YearMonth {
    month: number
    /** El mes ya empezó (hay datos reales) o es previsión */
    isForecast: boolean
    collected: number
    pending: number
    overdue: number
    missing: number
    forecast: number
}

export interface ClientDebt {
    clientId: string
    name: string
    amount: number
    months: Array<{ year: number; month: number; amount: number; state: RowState }>
}

// ---------------------------------------------------------------------------
// Fechas (en cadenas YYYY-MM-DD para no depender de zonas horarias)
// ---------------------------------------------------------------------------

export function periodIndex(year: number, month: number) {
    return year * 12 + (month - 1)
}

export function lastDayOfMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function toDateKey(year: number, month: number, day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Día de cobro del mes; sin día configurado vence el último día del mes */
export function dueDateFor(year: number, month: number, paymentDay: number | null | undefined) {
    const last = lastDayOfMonth(year, month)
    const day = paymentDay && paymentDay > 0 ? Math.min(paymentDay, last) : last
    return toDateKey(year, month, day)
}

function daysBetween(fromKey: string, toKey: string) {
    const [fy, fm, fd] = fromKey.split('-').map(Number)
    const [ty, tm, td] = toKey.split('-').map(Number)
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Mes de alta del atleta (start_date o, si falta, la fecha de creación) */
export function startPeriodOf(client: LedgerClient) {
    const source = client.start_date || client.created_at
    if (!source) return null
    const match = /^(\d{4})-(\d{2})/.exec(source)
    if (!match) return null
    return { year: Number(match[1]), month: Number(match[2]) }
}

export function feeOf(client: LedgerClient) {
    const amount = Number(client.payment_amount)
    return Number.isFinite(amount) && amount > 0 ? amount : 0
}

/** Debe pagar este mes según su ficha (sin mirar registros) */
export function isBillable(client: LedgerClient, year: number, month: number) {
    if (client.status !== 'active' || feeOf(client) <= 0) return false
    const start = startPeriodOf(client)
    if (!start) return false
    return periodIndex(start.year, start.month) <= periodIndex(year, month)
}

// ---------------------------------------------------------------------------
// Mes
// ---------------------------------------------------------------------------

export function resolveState(record: LedgerRecord, dueDate: string, today: string): RecordStatus {
    if (record.status === 'pending' && today > dueDate) return 'overdue'
    return record.status
}

export function buildMonthRows(
    clients: LedgerClient[],
    records: LedgerRecord[],
    year: number,
    month: number,
    today: string,
): MonthRow[] {
    const todayPeriod = periodIndex(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
    const isFuture = periodIndex(year, month) > todayPeriod
    const byClient = new Map(clients.map(client => [client.id, client]))
    const monthRecords = records.filter(record => record.year === year && record.month === month)
    const recordedClients = new Set(monthRecords.map(record => record.client_id))
    const rows: MonthRow[] = []

    for (const record of monthRecords) {
        const client = byClient.get(record.client_id)
        const dueDate = dueDateFor(year, month, client?.payment_day)
        const state = resolveState(record, dueDate, today)
        rows.push({
            key: record.id,
            clientId: record.client_id,
            name: client?.full_name || 'Atleta',
            email: client?.email || '',
            clientActive: client?.status === 'active',
            amount: Number(record.amount) || 0,
            state,
            dueDate,
            daysLate: state === 'overdue' || state === 'pending' ? Math.max(0, daysBetween(dueDate, today)) : 0,
            record,
        })
    }

    if (!isFuture) {
        for (const client of clients) {
            if (recordedClients.has(client.id) || !isBillable(client, year, month)) continue
            const dueDate = dueDateFor(year, month, client.payment_day)
            rows.push({
                key: `missing-${client.id}`,
                clientId: client.id,
                name: client.full_name || 'Atleta',
                email: client.email || '',
                clientActive: true,
                amount: feeOf(client),
                state: 'missing',
                dueDate,
                daysLate: Math.max(0, daysBetween(dueDate, today)),
                record: null,
            })
        }
    }

    const order: Record<RowState, number> = { overdue: 0, missing: 1, pending: 2, paid: 3, waived: 4 }
    return rows.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name, 'es'))
}

export function summarizeMonth(rows: MonthRow[]): MonthSummary {
    const counts: Record<RowState, number> = { paid: 0, pending: 0, overdue: 0, waived: 0, missing: 0 }
    const summary: MonthSummary = { expected: 0, collected: 0, pending: 0, overdue: 0, missing: 0, waived: 0, counts }
    for (const row of rows) {
        counts[row.state] += 1
        if (row.state === 'waived') {
            summary.waived += row.amount
            continue
        }
        summary.expected += row.amount
        if (row.state === 'paid') summary.collected += row.amount
        else if (row.state === 'pending') summary.pending += row.amount
        else if (row.state === 'overdue') summary.overdue += row.amount
        else summary.missing += row.amount
    }
    return summary
}

// ---------------------------------------------------------------------------
// Año
// ---------------------------------------------------------------------------

export function buildYear(
    clients: LedgerClient[],
    records: LedgerRecord[],
    year: number,
    today: string,
): YearMonth[] {
    const todayPeriod = periodIndex(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
    return Array.from({ length: 12 }, (_, index) => {
        const month = index + 1
        const isForecast = periodIndex(year, month) > todayPeriod
        if (isForecast) {
            const forecast = clients
                .filter(client => isBillable(client, year, month))
                .reduce((sum, client) => sum + feeOf(client), 0)
            return { month, isForecast, collected: 0, pending: 0, overdue: 0, missing: 0, forecast }
        }
        const summary = summarizeMonth(buildMonthRows(clients, records, year, month, today))
        return {
            month,
            isForecast,
            collected: summary.collected,
            pending: summary.pending,
            overdue: summary.overdue,
            missing: summary.missing,
            forecast: 0,
        }
    })
}

/**
 * Lo que debe cada atleta en el año: cobros vencidos y meses sin registrar
 * cuyo día de cobro ya pasó. Lo pendiente que aún no vence no es deuda.
 */
export function debtsByClient(
    clients: LedgerClient[],
    records: LedgerRecord[],
    year: number,
    today: string,
): ClientDebt[] {
    const todayPeriod = periodIndex(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
    const debts = new Map<string, ClientDebt>()
    for (let month = 1; month <= 12; month++) {
        if (periodIndex(year, month) > todayPeriod) break
        for (const row of buildMonthRows(clients, records, year, month, today)) {
            const isDebt = row.state === 'overdue' || (row.state === 'missing' && row.daysLate > 0)
            if (!isDebt) continue
            const debt = debts.get(row.clientId) ?? { clientId: row.clientId, name: row.name, amount: 0, months: [] }
            debt.amount += row.amount
            debt.months.push({ year, month, amount: row.amount, state: row.state })
            debts.set(row.clientId, debt)
        }
    }
    return [...debts.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'))
}

/** Atletas activos que no aparecen en facturación porque no tienen cuota */
export function clientsWithoutFee(clients: LedgerClient[]) {
    return clients
        .filter(client => client.status === 'active' && feeOf(client) <= 0)
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'es'))
}
