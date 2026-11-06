import { z } from 'npm:zod@4.3.6'
import { prepareSessions } from '../../../src/lib/studio/grid-rules.js'
import { itemForPerson } from '../../../src/lib/studio/group-rules.js'
import { parseMediaLink } from '../../../src/lib/studio/media-rules.js'
import { buildReport, PENDING_REPORT_COLUMNS, pendingReportList, reportMessage, whatsappUrl } from '../../../src/lib/studio/report-rules.js'
import { createToolRunner, type Db, defaultHelpers, readOnlyAnnotations, type Row, rows, type ToolHelpers, writeAnnotations } from './shared.ts'
import { resolveExercises, studioError } from './studio.ts'

type Server = any

const optionalCoachId = z.string().uuid().optional().describe('Solo si la cuenta pertenece a varios espacios.')
const PRODUCTION_URL = 'https://nexttrain.ascenttech.cloud'

function reportUrl(code: string) {
  const base = Deno.env.get('APP_URL')?.replace(/\/+$/, '') || PRODUCTION_URL
  return `${base}/informe/${code}`
}

/** Un medio tal como lo ve la IA. Los archivos son privados: de ellos solo sale el nombre. */
export function mediaEntry(row: Row) {
  const file = row.kind === 'image' || row.kind === 'video'
  return {
    id: row.id,
    kind: row.kind,
    scope: row.client_id ? 'client' : 'room',
    client_id: row.client_id,
    title: row.video?.title ?? row.title ?? null,
    url: file ? null : row.url,
    duration_seconds: row.video?.duration_seconds ?? null,
  }
}

/** Todo lo que necesita el informe de una persona, con sus valores si la sesión es una clase. */
async function loadReportInput(db: Db, coachId: string, sessionId: string, clientId: string) {
  const failed = 'No se ha podido preparar el informe.'
  const attended = rows(
    await db.from('studio_session_attendance').select('session_id').eq('client_id', clientId).neq('status', 'absent'),
    'asistencia',
    failed,
  ).map((row) => row.session_id)

  const list = rows(
    await db.from('studio_sessions')
      .select('*, training_groups(name)')
      .eq('coach_id', coachId)
      .or(attended.length > 0 ? `client_id.eq.${clientId},id.in.(${attended.join(',')})` : `client_id.eq.${clientId}`)
      .order('session_date', { ascending: true }),
    'sesiones',
    failed,
  ).map(({ training_groups: group, ...session }) => ({ ...session, group_name: group?.name ?? null }) as Row)

  const session = list.find((entry) => entry.id === sessionId)
  if (!session) throw new Error('Esta persona no está en esa sesión.')

  const ids = list.map((entry) => entry.id)
  const [itemRows, people, sections, settings, client] = await Promise.all([
    db.from('studio_session_items')
      .select('id, session_id, section_id, sort_order, catalog_exercise_id, sets, reps, time_seconds, load_kg, rir, rpe, next_load, circuit, is_done, exercise_catalog(name), studio_item_tags(studio_tags(name))')
      .in('session_id', ids)
      .order('sort_order'),
    db.from('studio_item_people').select('item_id, client_id, load_kg, reps, time_seconds, rir, rpe, next_load').eq('client_id', clientId),
    db.from('studio_session_sections').select('id, session_id, title, parent_title, sort_order').eq('session_id', sessionId).order('sort_order'),
    db.from('report_settings').select('sections').eq('coach_id', coachId).maybeSingle(),
    db.from('clients').select('full_name').eq('id', clientId).maybeSingle(),
  ])

  const personal = rows(people, 'valores', failed)
  const allItems = rows(itemRows, 'ejercicios', failed).map(({ exercise_catalog: catalog, studio_item_tags: links, ...item }) => {
    const full = {
      ...item,
      exercise_name: catalog?.name ?? '',
      tags: (links ?? []).flatMap((link: Row) => link.studio_tags ?? []).map((tag: Row) => tag.name),
    }
    return itemForPerson(full, personal.find((person) => person.item_id === item.id))
  })
  const items = allItems.filter((item: Row) => item.session_id === sessionId)
  const sets = items.length > 0
    ? rows(
      await db.from('studio_session_sets')
        .select('item_id, client_id, set_index, load_kg, reps, is_detailed')
        .in('item_id', items.map((item: Row) => item.id))
        .eq('client_id', clientId),
      'series',
      failed,
    )
    : []

  const numbered = prepareSessions(list, session.session_date, Number.MAX_SAFE_INTEGER).sessions
    .find((entry: Row) => entry.id === sessionId)

  return buildReport({
    client: { fullName: client.data?.full_name ?? 'Cliente' },
    session,
    number: numbered?.number ?? null,
    professional: null,
    sections: rows(sections, 'subbloques', failed),
    items,
    sets,
    sessions: list,
    allItems,
    clientId,
    visible: settings.data?.sections,
  })
}

export function registerStudioReportTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'list_exercise_media',
    {
      title: 'Ver la técnica de un ejercicio',
      description: 'Lista los enlaces, imágenes y vídeos de un ejercicio: los de la sala y, si indicas client_id, los de ese cliente. Los archivos son privados y solo se ven en la app.',
      inputSchema: z.object({
        catalog_exercise_id: z.string().uuid().optional().describe('ID de list_exercise_catalog.'),
        name: z.string().trim().min(1).max(160).optional().describe('Nombre o alias, si no tienes el ID.'),
        client_id: z.string().uuid().optional(),
        coach_id: optionalCoachId,
      }).refine((input) => input.catalog_exercise_id || input.name, 'Indica catalog_exercise_id o name.'),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('list_exercise_media', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se han podido consultar los medios.',
    }, async ({ coachId, log }) => {
      const [{ id: exerciseId }] = await resolveExercises(db, [input])
      const query = db.from('exercise_media')
        .select('id, client_id, kind, url, title, video:media_assets(title, duration_seconds)')
        .eq('coach_id', coachId)
        .eq('catalog_exercise_id', exerciseId)
        .order('created_at')
      const media = rows(
        await (input.client_id ? query.or(`client_id.is.null,client_id.eq.${input.client_id}`) : query.is('client_id', null)),
        'medios',
        'No se han podido consultar los medios.',
      )
      log.result_count = media.length
      return { catalog_exercise_id: exerciseId, media: media.map(mediaEntry) }
    }),
  )

  server.registerTool(
    'attach_exercise_link',
    {
      title: 'Añadir un enlace de técnica',
      description: 'Añade a un ejercicio un enlace de YouTube, Instagram u otro, para toda la sala o solo para un cliente. Solo admite https.',
      inputSchema: z.object({
        catalog_exercise_id: z.string().uuid().optional().describe('ID de list_exercise_catalog.'),
        name: z.string().trim().min(1).max(160).optional().describe('Nombre o alias, si no tienes el ID.'),
        url: z.string().trim().min(1).max(500),
        title: z.string().trim().max(120).optional(),
        client_id: z.string().uuid().optional().describe('Solo si es para un cliente. Sin él, es de toda la sala.'),
        coach_id: optionalCoachId,
      }).refine((input) => input.catalog_exercise_id || input.name, 'Indica catalog_exercise_id o name.'),
      annotations: writeAnnotations,
    },
    (input: any) => run('attach_exercise_link', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se ha podido añadir el enlace.',
    }, async ({ coachId, log }) => {
      const link = parseMediaLink(input.url)
      if ('error' in link) throw new Error(link.error)
      const [{ id: exerciseId }] = await resolveExercises(db, [input])
      const { data, error } = await db.rpc('studio_add_exercise_media', {
        p_coach_id: coachId,
        p_catalog_exercise_id: exerciseId,
        p_client_id: input.client_id ?? null,
        p_kind: link.kind,
        p_url: link.url,
        p_storage_key: null,
        p_title: input.title ?? null,
      })
      if (error) throw studioError(error, 'No se ha podido añadir el enlace.')
      log.record_id = data.id
      return { attached: true, media: mediaEntry(data) }
    }),
  )

  server.registerTool(
    'list_pending_reports',
    {
      title: 'Ver informes por enviar',
      description: 'Lista las sesiones de hoy ya hechas cuyo informe sigue sin enviarse, dentro de la ventana del aviso de la sala.',
      inputSchema: z.object({ coach_id: optionalCoachId }),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('list_pending_reports', {
      coachId: input.coach_id,
      fallbackError: 'No se han podido consultar los informes.',
    }, async ({ coachId, today, log }) => {
      const failed = 'No se han podido consultar los informes.'
      const [sessions, settings] = await Promise.all([
        db.from('studio_sessions').select(PENDING_REPORT_COLUMNS).eq('coach_id', coachId).eq('session_date', today).eq('status', 'done'),
        db.from('report_settings').select('notice_hours').eq('coach_id', coachId).maybeSingle(),
      ])
      const list = rows(sessions, 'sesiones', failed)
      const snoozes = list.length > 0
        ? rows(
          await db.from('report_snoozes').select('session_id, client_id, until').in('session_id', list.map((session) => session.id)),
          'avisos',
          failed,
        )
        : []
      const reports = pendingReportList(list, snoozes, settings.data?.notice_hours)
      log.result_count = reports.length
      return {
        date: today,
        reports: reports.map((report: Row) => ({ session_id: report.sessionId, client_id: report.clientId, group_id: report.groupId, name: report.name })),
      }
    }),
  )

  server.registerTool(
    'create_session_report',
    {
      title: 'Crear el informe de una sesión',
      description: 'Crea o actualiza el informe de una persona en una sesión de sala y devuelve su enlace privado. Repetirlo lo actualiza sin cambiar el enlace.',
      inputSchema: z.object({
        session_id: z.string().uuid(),
        client_id: z.string().uuid(),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('create_session_report', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se ha podido crear el informe.',
    }, async ({ coachId, log }) => {
      const snapshot = await loadReportInput(db, coachId, input.session_id, input.client_id)
      const { data, error } = await db.rpc('studio_save_report', {
        p_session_id: input.session_id,
        p_client_id: input.client_id,
        p_snapshot: snapshot,
      })
      if (error) throw studioError(error, 'No se ha podido crear el informe.')
      const { data: client } = await db.from('clients').select('report_consent_at').eq('id', input.client_id).maybeSingle()
      log.record_id = data.id
      return { created: true, report_id: data.id, url: reportUrl(data.code), consent: Boolean(client?.report_consent_at) }
    }),
  )

  server.registerTool(
    'send_session_report',
    {
      title: 'Enviar un informe de sesión',
      description: 'Apunta el envío de un informe ya creado y devuelve el enlace: con whatsapp, el chat con el mensaje listo para abrir; con link, el enlace del informe. El email se envía desde la app. Sin consentimiento del cliente no se envía por WhatsApp.',
      inputSchema: z.object({
        session_id: z.string().uuid(),
        client_id: z.string().uuid(),
        channel: z.enum(['whatsapp', 'link']),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('send_session_report', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se ha podido enviar el informe.',
    }, async ({ coachId, log }) => {
      const { data: report } = await db.from('session_reports')
        .select('id, code, revoked_at, snapshot')
        .eq('session_id', input.session_id)
        .eq('client_id', input.client_id)
        .maybeSingle()
      if (!report || report.revoked_at || Object.keys(report.snapshot ?? {}).length === 0) {
        throw new Error('Crea antes el informe con create_session_report.')
      }

      let url = reportUrl(report.code)
      let recipient: string | null = null
      if (input.channel === 'whatsapp') {
        const [client, settings, branding, coach] = await Promise.all([
          db.from('clients').select('full_name, phone').eq('id', input.client_id).maybeSingle(),
          db.from('report_settings').select('whatsapp_text').eq('coach_id', coachId).maybeSingle(),
          db.from('workspace_branding').select('display_name').eq('coach_id', coachId).maybeSingle(),
          db.from('coaches').select('name').eq('id', coachId).maybeSingle(),
        ])
        const center = branding.data?.display_name ?? coach.data?.name ?? 'tu centro'
        const chat = whatsappUrl(client.data?.phone, reportMessage(client.data?.full_name, center, url, settings.data?.whatsapp_text))
        if (!chat) throw new Error('Este cliente no tiene un teléfono válido.')
        url = chat
        recipient = client.data?.phone ?? null
      }

      const { error } = await db.rpc('studio_record_delivery', {
        p_report_id: report.id,
        p_channel: input.channel,
        p_recipient: recipient,
      })
      if (error) throw studioError(error, 'No se ha podido enviar el informe.')
      log.record_id = report.id
      return { recorded: true, channel: input.channel, url }
    }),
  )
}
