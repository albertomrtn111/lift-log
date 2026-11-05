import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1'
import { classifyService, createClient, instant, mapAppointment, TokenRejected } from './fisiotrack.ts'
import { isIncomplete, nextTypical, syncWindow, vanished } from './sync-rules.ts'

const raw = {
  id: 77,
  status: 'confirmed',
  patient_status: 'successive_appointment',
  starts_at: '2026-11-05T18:00:00+01:00',
  ends_at: '2026-11-05T19:00:00+01:00',
  updated_at: '2026-11-01T10:00:00+01:00',
  notes: 'Nota clínica',
  price: 4500,
  patient: { id: 9, name: ' Ana Ruiz ', phone: '600', email: 'a@example.com', dni: '123' },
  professional: { id: 3, name: 'Marcos' },
  service: { id: 5, name: 'TEAM' },
  voucher: { id: 1 },
}

Deno.test('la cita conserva solo lo necesario', () => {
  const item = mapAppointment(raw)
  assertEquals(item.externalId, '77')
  assertEquals(item.startsAt, '2026-11-05T17:00:00.000Z')
  assertEquals(item.patient, { externalId: '9', fullName: 'Ana Ruiz', phone: '600', email: 'a@example.com' })
  const text = JSON.stringify(item)
  for (const secret of ['Nota clínica', '4500', '123"', 'voucher']) assertEquals(text.includes(secret), false)
})

Deno.test('una cita sin servicio entra igualmente', () => {
  assertEquals(mapAppointment({ ...raw, service: null }).service, null)
})

Deno.test('una fecha sin zona o un estado desconocido no pasan', () => {
  assertThrows(() => instant('2026-11-05T18:00:00'))
  assertThrows(() => mapAppointment({ ...raw, status: 'raro' }))
})

Deno.test('los servicios se clasifican como se aprobó', () => {
  assertEquals(classifyService('TEAM TRAINING').kind, 'training')
  assertEquals(classifyService('EP').groupMode, 'auto')
  assertEquals(classifyService('FISIOTERAPIA (BONO)').groupMode, 'individual')
  assertEquals(classifyService('FISIOTERAPIA PAREJAS').groupMode, 'shared')
  assertEquals(classifyService('ENTRENAMIENTO ONLINE').createsSession, false)
  assertEquals(classifyService('FISIOTERAPIA EXPRESS').createsSession, false)
  assertEquals(classifyService('REHABILITACIÓN NEUROMUSCULAR').kind, 'physio')
})

Deno.test('recorre todas las páginas y espera si le limitan', async () => {
  const urls: string[] = []
  let limited = false
  const fetcher = (url: string) => {
    urls.push(url)
    if (!limited) {
      limited = true
      return Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
    }
    const page = Number(new URL(url).searchParams.get('page'))
    return Promise.resolve(Response.json({ data: [{ ...raw, id: page }], meta: { last_page: 2 } }))
  }
  const items = await createClient('t', fetcher, () => Promise.resolve()).appointments('2026-11-05', '2026-11-06')
  assertEquals(items.map((item) => item.externalId), ['1', '2'])
  assertEquals(urls.length, 3)
})

Deno.test('un token rechazado se distingue de un fallo cualquiera', async () => {
  const client = createClient('t', () => Promise.resolve(new Response('', { status: 401 })))
  await assertRejects(() => client.appointments('2026-11-05', '2026-11-06'), TokenRejected)
})

Deno.test('solo se piden citas: la API nunca recibe una escritura', async () => {
  const methods: string[] = []
  const fetcher = (_url: string, init: RequestInit) => {
    methods.push(String(init.method))
    return Promise.resolve(Response.json({ data: [], meta: { last_page: 1 } }))
  }
  const client = createClient('t', fetcher)
  await client.appointments('2026-11-05', '2026-11-06')
  await client.services()
  assertEquals([...new Set(methods)], ['GET'])
})

Deno.test('las dos ventanas de sincronización', () => {
  assertEquals(syncWindow('quick', '2026-11-05'), { from: '2026-11-05', to: '2026-11-06' })
  assertEquals(syncWindow('full', '2026-11-05'), { from: '2026-10-29', to: '2026-11-26' })
})

Deno.test('una agenda sospechosamente corta no borra nada', () => {
  assertEquals(isIncomplete(100, 700), true)
  assertEquals(isIncomplete(600, 700), false)
  assertEquals(isIncomplete(3, null), false)
  assertEquals(vanished(['a', 'b'], ['a'], false), ['b'])
  assertEquals(vanished(['a', 'b'], ['a'], true), [])
})

Deno.test('lo habitual se mueve despacio', () => {
  assertEquals(nextTypical(null, 700), 700)
  assertEquals(nextTypical(700, 600), 670)
})
