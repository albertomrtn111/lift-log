// agenda-sync: baja las citas del software de cada centro con una conexión activa.
// Sin conexiones activas no hace nada. Nunca escribe en el software externo.
import { createClient as createDb } from 'npm:@supabase/supabase-js@2.117.2'
import { classifyService, createClient, TokenRejected } from './fisiotrack.ts'
import { isIncomplete, nextTypical, syncWindow, vanished } from './sync-rules.ts'

type Row = Record<string, any>

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

async function syncConnection(db: any, connection: Row, kind: 'quick' | 'full') {
  const { data: token } = await db.rpc('agenda_connection_token', { p_connection_id: connection.id })
  if (!token) throw new TokenRejected()

  const api = createClient(token)
  const { from, to } = syncWindow(kind, today())
  const appointments = await api.appointments(from, to)
  const coachId = connection.coach_id

  if (kind === 'full') {
    const services = await api.services()
    if (services.length > 0) {
      const { data: known } = await db.from('agenda_services').select('external_id').eq('coach_id', coachId).eq('provider', 'fisiotrack')
      const existing = new Set((known ?? []).map((row: Row) => row.external_id))
      // Lo que el centro ya clasificó no se toca: de los conocidos solo se refresca el nombre.
      await db.from('agenda_services').upsert(
        services.map((service) => ({
          coach_id: coachId,
          provider: 'fisiotrack',
          external_id: service.externalId,
          name: service.name,
          duration_min: service.durationMin,
          ...(existing.has(service.externalId) ? {} : (() => {
            const rule = classifyService(service.name)
            return { kind: rule.kind, group_mode: rule.groupMode, creates_session: rule.createsSession }
          })()),
        })),
        { onConflict: 'coach_id,provider,external_id' },
      )
    }
  }

  const patients = new Map(appointments.flatMap((item) => (item.patient ? [[item.patient.externalId, item.patient]] : [])))
  if (patients.size > 0) {
    await db.from('external_patients').upsert(
      [...patients.values()].map((patient) => ({
        coach_id: coachId, provider: 'fisiotrack', external_id: patient.externalId,
        full_name: patient.fullName, phone: patient.phone, email: patient.email, updated_at: new Date().toISOString(),
      })),
      { onConflict: 'coach_id,provider,external_id' },
    )
  }

  const staff = new Map(appointments.flatMap((item) => (item.staff ? [[item.staff.externalId, item.staff]] : [])))
  if (staff.size > 0) {
    await db.from('external_staff_map').upsert(
      [...staff.values()].map((member) => ({
        coach_id: coachId, provider: 'fisiotrack', external_id: member.externalId,
        external_name: member.name, updated_at: new Date().toISOString(),
      })),
      { onConflict: 'coach_id,provider,external_id' },
    )
  }

  const [{ data: patientRows }, { data: serviceRows }, { data: staffRows }] = await Promise.all([
    db.from('external_patients').select('id, external_id, client_id').eq('coach_id', coachId).eq('provider', 'fisiotrack'),
    db.from('agenda_services').select('id, external_id').eq('coach_id', coachId).eq('provider', 'fisiotrack'),
    db.from('external_staff_map').select('external_id, user_id').eq('coach_id', coachId).eq('provider', 'fisiotrack'),
  ])
  const patientByExternal = new Map((patientRows ?? []).map((row: Row) => [row.external_id, row]))
  const serviceByExternal = new Map((serviceRows ?? []).map((row: Row) => [row.external_id, row.id]))
  const staffByExternal = new Map((staffRows ?? []).map((row: Row) => [row.external_id, row.user_id]))

  if (appointments.length > 0) {
    const { error } = await db.from('agenda_appointments').upsert(
      appointments.map((item) => {
        const patient = item.patient ? patientByExternal.get(item.patient.externalId) as Row | undefined : undefined
        return {
          coach_id: coachId,
          location_id: connection.location_id,
          provider: 'fisiotrack',
          external_id: item.externalId,
          external_patient_id: patient?.id ?? null,
          client_id: patient?.client_id ?? null,
          external_staff_id: item.staff?.externalId ?? null,
          professional_id: item.staff ? staffByExternal.get(item.staff.externalId) ?? null : null,
          service_id: item.service ? serviceByExternal.get(item.service.externalId) ?? null : null,
          starts_at: item.startsAt,
          ends_at: item.endsAt,
          status: item.status,
          external_updated_at: item.updatedAt,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        }
      }),
      { onConflict: 'coach_id,provider,external_id' },
    )
    if (error) throw new Error('No se han podido guardar las citas.')
  }

  const incomplete = kind === 'full' && isIncomplete(appointments.length, connection.typical_window_count)
  const { data: stored } = await db.from('agenda_appointments')
    .select('external_id')
    .eq('coach_id', coachId)
    .eq('provider', 'fisiotrack')
    .is('deleted_at', null)
    .gte('starts_at', `${from}T00:00:00+00:00`)
    // Los filtros son días de la clínica: el límite queda antes de medianoche allí, para no dar por
    // borrada una cita de madrugada del día siguiente, que no se ha pedido.
    .lte('starts_at', `${to}T21:59:59+00:00`)
  const gone = vanished(
    (stored ?? []).map((row: Row) => row.external_id),
    appointments.map((item) => item.externalId),
    incomplete || appointments.length === 0,
  )
  if (gone.length > 0) {
    await db.from('agenda_appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('coach_id', coachId)
      .eq('provider', 'fisiotrack')
      .in('external_id', gone)
  }

  await db.from('external_connections').update({
    status: 'active',
    last_error: incomplete ? 'La agenda ha llegado incompleta: no se ha quitado ninguna cita.' : null,
    last_sync_at: new Date().toISOString(),
    ...(kind === 'full' ? {
      last_full_sync_at: new Date().toISOString(),
      ...(incomplete ? {} : { typical_window_count: nextTypical(connection.typical_window_count, appointments.length) }),
    } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id)

  // De las citas a las sesiones: las reglas viven en la base de datos, junto a los datos.
  const applied = await db.rpc('agenda_apply', { p_coach_id: coachId })
  if (applied.error) throw new Error('No se han podido aplicar las citas a las sesiones.')

  return { appointments: appointments.length, removed: gone.length, incomplete, applied: applied.data }
}

Deno.serve(async (request) => {
  // La llaman la tarea programada y Sincronizar ahora, nunca el navegador directamente.
  const secret = Deno.env.get('AGENDA_SYNC_SECRET')
  if (!secret || request.headers.get('x-agenda-secret') !== secret) {
    return new Response('No autorizado', { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const kind = body.kind === 'full' ? 'full' : 'quick'
  const db = createDb(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: connections } = await db.from('external_connections').select('*').eq('status', 'active')
  const results = []
  for (const connection of connections ?? []) {
    try {
      results.push({ connection: connection.id, ...(await syncConnection(db, connection, kind)) })
    } catch (error) {
      const rejected = error instanceof TokenRejected
      await db.from('external_connections').update({
        status: rejected ? 'error' : connection.status,
        last_error: error instanceof Error ? error.message : 'Error de sincronización.',
        updated_at: new Date().toISOString(),
      }).eq('id', connection.id)
      console.error(JSON.stringify({ event: 'agenda_sync_failed', connection: connection.id }))
      results.push({ connection: connection.id, failed: true })
    }
  }
  return Response.json({ kind, results })
})
