import assert from 'node:assert/strict'
import { clientAttentionFlags, registerClientTools } from './clients.ts'
import { createToolRunner, DEFAULT_TIME_ZONE, resolveCoach, resolveTimeZone, todayIn } from './shared.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
// 23:30 UTC del 15 de octubre: en Madrid (UTC+2 en horario de verano) ya es 16 de octubre a la 01:30.
const lateNight = new Date('2026-10-15T23:30:00Z')

Deno.test('todayIn at 23:30 UTC returns the next day in Europe/Madrid', () => {
  assert.equal(todayIn('Europe/Madrid', lateNight), '2026-10-16')
  assert.equal(todayIn('UTC', lateNight), '2026-10-15')
  assert.equal(todayIn('America/Mexico_City', lateNight), '2026-10-15')
  // En invierno Madrid es UTC+1: a las 23:30 UTC del 15 de enero también es día 16.
  assert.equal(todayIn('Europe/Madrid', new Date('2027-01-15T23:30:00Z')), '2027-01-16')
  assert.equal(todayIn('Europe/Madrid', new Date('2027-01-15T22:59:00Z')), '2027-01-15')
})

Deno.test('an empty or unknown time zone falls back to Europe/Madrid', () => {
  assert.equal(DEFAULT_TIME_ZONE, 'Europe/Madrid')
  assert.equal(resolveTimeZone(null), 'Europe/Madrid')
  assert.equal(resolveTimeZone(''), 'Europe/Madrid')
  assert.equal(resolveTimeZone('Mars/Olympus'), 'Europe/Madrid')
  assert.equal(resolveTimeZone('Atlantic/Canary'), 'Atlantic/Canary')
  assert.equal(todayIn('Mars/Olympus', lateNight), '2026-10-16')
})

function membershipDb(coaches: unknown) {
  const calls: any[] = []
  const query: any = {
    select(fields: string) { calls.push(['select', fields]); return query },
    eq() { return query }, in() { return query }, order() { return query },
    then(resolve: any) {
      return Promise.resolve({ data: [{ coach_id: coach, role: 'owner', status: 'active', coaches }], error: null }).then(resolve)
    },
  }
  return { calls, db: { from(table: string) { calls.push(['from', table]); return query } } }
}

Deno.test('resolveCoach reads the workspace time zone in the membership query', async () => {
  const withZone = membershipDb({ timezone: 'Atlantic/Canary' })
  assert.deepEqual(await resolveCoach(withZone.db), { coachId: coach, role: 'owner', timeZone: 'Atlantic/Canary' })
  // Una sola consulta: la zona viene embebida, sin otra petición a coaches.
  assert.deepEqual(withZone.calls.filter((call) => call[0] === 'from'), [['from', 'coach_memberships']])
  assert.match(withZone.calls.find((call) => call[0] === 'select')[1], /coaches\(timezone\)/)

  assert.equal((await resolveCoach(membershipDb(null).db)).timeZone, 'Europe/Madrid')
  assert.equal((await resolveCoach(membershipDb({ timezone: null }).db)).timeZone, 'Europe/Madrid')
})

Deno.test('the tool runner resolves the zone once and passes today in that zone', async () => {
  let resolves = 0
  const run = createToolRunner({}, {
    resolveCoach: async () => { resolves++; return { coachId: coach, timeZone: 'Europe/Madrid' } },
    requireClient: async () => ({}),
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
    now: () => lateNight,
  })
  const { data } = await run('test', { fallbackError: 'error' }, async ({ today, timeZone }) => ({ today, timeZone }))
  assert.deepEqual(data, { today: '2026-10-16', timeZone: 'Europe/Madrid' })
  assert.equal(resolves, 1)
})

Deno.test('checkin_atrasado compares with today in the workspace zone', () => {
  const due = { next_checkin_date: '2026-10-15' }
  const latest = { training_adherence_pct: 90 }
  assert.deepEqual(clientAttentionFlags(due, latest, todayIn('Europe/Madrid', lateNight)), ['checkin_atrasado'])
  assert.deepEqual(clientAttentionFlags(due, latest, todayIn('UTC', lateNight)), [])
})

function listClientsFixture(timeZone: string | undefined) {
  const clients = [
    { id: client, full_name: 'Ana', status: 'active', start_date: '2026-01-01', next_checkin_date: '2026-10-15', checkin_frequency_days: 7 },
    { id: 'client-2', full_name: 'Bea', status: 'active', start_date: '2026-01-01', next_checkin_date: '2026-10-16', checkin_frequency_days: 7 },
  ]
  const db = {
    from() {
      let filtered = [...clients]
      const query: any = {
        select() { return query }, order() { return query }, ilike() { return query },
        eq(key: string, value: unknown) { if (key !== 'coach_id') filtered = filtered.filter((row: any) => row[key] === value); return query },
        range(start: number, end: number) { filtered = filtered.slice(start, end + 1); return query },
        then(resolve: any) { return Promise.resolve({ data: filtered, error: null }).then(resolve) },
      }
      return query
    },
    rpc: () => Promise.resolve({ data: clients.map((row) => ({ client_id: row.id, training_adherence_pct: 90 })), error: null }),
  }
  const tools = new Map<string, any>()
  registerClientTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async () => ({ coachId: coach, timeZone }),
    requireClient: async () => ({}),
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
    now: () => lateNight,
  })
  const tool = tools.get('list_clients')
  return () => tool.run(tool.config.inputSchema.parse({}))
}

Deno.test('list_clients flags checkin_atrasado using the Madrid day after midnight', async () => {
  const { data } = await listClientsFixture('Europe/Madrid')()
  assert.equal(data.today, '2026-10-16')
  assert.deepEqual(data.clients.map((row: any) => row.attention_flags), [['checkin_atrasado'], []])

  // Sin zona guardada también se usa Madrid.
  const fallback = await listClientsFixture(undefined)()
  assert.equal(fallback.data.today, '2026-10-16')

  // En UTC todavía es día 15 y el check-in del 15 no está atrasado.
  const utc = await listClientsFixture('UTC')()
  assert.deepEqual(utc.data.clients.map((row: any) => row.attention_flags), [[], []])
})
