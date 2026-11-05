// Adaptador de FisioTrack, de solo lectura. Cada proveedor nuevo es un archivo como este.
// La API entrega más de lo que hace falta: aquí se descarta todo lo que no sea necesario,
// así que precios, notas, DNI y bonos no pasan nunca de esta capa.

export type ExternalAppointment = {
  externalId: string
  status: 'pending' | 'confirmed' | 'canceled'
  startsAt: string
  endsAt: string | null
  updatedAt: string | null
  patient: { externalId: string; fullName: string; phone: string | null; email: string | null } | null
  staff: { externalId: string; name: string } | null
  service: { externalId: string; name: string } | null
}

export type ExternalService = { externalId: string; name: string; durationMin: number | null }

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const BASE_URL = 'https://app.fisiotrack.com/api/v1'
const MAX_RETRIES = 5

/** Lee siempre el desfase de la fecha: hasta octubre de 2026 la API lo enviaba mal en algunos casos. */
export function instant(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new Error('La API ha devuelto una fecha sin zona.')
  }
  return date.toISOString()
}

const STATUSES: Record<string, ExternalAppointment['status']> = {
  pending: 'pending',
  confirmed: 'confirmed',
  canceled: 'canceled',
}

export function mapAppointment(raw: any): ExternalAppointment {
  const status = STATUSES[raw.status]
  const startsAt = instant(raw.starts_at)
  if (!status || !startsAt) throw new Error(`Cita ${raw.id} con estado o inicio no reconocido.`)
  return {
    externalId: String(raw.id),
    status,
    startsAt,
    endsAt: instant(raw.ends_at),
    updatedAt: instant(raw.updated_at),
    patient: raw.patient?.id == null ? null : {
      externalId: String(raw.patient.id),
      fullName: String(raw.patient.name ?? '').trim() || 'Sin nombre',
      phone: raw.patient.phone ?? null,
      email: raw.patient.email ?? null,
    },
    staff: raw.professional?.id == null ? null : {
      externalId: String(raw.professional.id),
      name: String(raw.professional.name ?? '').trim() || 'Sin nombre',
    },
    service: raw.service?.id == null ? null : {
      externalId: String(raw.service.id),
      name: String(raw.service.name ?? '').trim() || 'Sin nombre',
    },
  }
}

export function mapService(raw: any): ExternalService {
  return {
    externalId: String(raw.id),
    name: String(raw.name ?? '').trim() || 'Sin nombre',
    durationMin: Number.isInteger(raw.duration) ? raw.duration : null,
  }
}

/** Primera clasificación de un servicio por su nombre. El centro la puede cambiar en Integraciones. */
export function classifyService(name: string) {
  const text = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  if (/ONLINE/.test(text)) return { kind: 'online', groupMode: 'individual', createsSession: false }
  if (/EXPRESS|PRUEBAS DE IMAGEN/.test(text)) return { kind: 'none', groupMode: 'individual', createsSession: false }
  if (/PAREJAS/.test(text) && /FISIO/.test(text)) return { kind: 'physio', groupMode: 'shared', createsSession: true }
  if (/FISIO|PRESOTERAPIA|REHABILITACION|VALORACION/.test(text)) {
    return { kind: 'physio', groupMode: 'individual', createsSession: true }
  }
  return { kind: 'training', groupMode: 'auto', createsSession: true }
}

export function createClient(token: string, fetcher: Fetcher = fetch, wait = (ms: number) => new Promise((done) => setTimeout(done, ms))) {
  async function get(path: string, params: Record<string, string | number>) {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetcher(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (response.status === 429) {
        await wait(Number(response.headers.get('retry-after') ?? 5) * 1000)
        continue
      }
      if (response.status === 401 || response.status === 403) throw new TokenRejected()
      if (!response.ok) throw new Error(`FisioTrack ha respondido ${response.status}.`)
      return await response.json()
    }
    throw new Error('FisioTrack sigue limitando las peticiones.')
  }

  async function all(path: string, params: Record<string, string | number> = {}) {
    const rows: any[] = []
    for (let page = 1; ; page++) {
      const body = await get(path, { ...params, per_page: 100, page })
      if (!Array.isArray(body.data) || !Number.isInteger(body.meta?.last_page)) {
        throw new Error('La respuesta de FisioTrack no tiene el formato esperado.')
      }
      rows.push(...body.data)
      if (page >= body.meta.last_page) return rows
    }
  }

  return {
    appointments: async (from: string, to: string) => (await all('/appointments', { from, to })).map(mapAppointment),
    services: async () => (await all('/services')).map(mapService),
  }
}

export class TokenRejected extends Error {
  constructor() {
    super('El token ya no es válido.')
  }
}
