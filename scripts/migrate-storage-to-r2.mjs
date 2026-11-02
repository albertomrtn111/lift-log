#!/usr/bin/env node
// Copia las fotos de Supabase Storage a Cloudflare R2 y apunta la base de datos a R2.
// Guía completa: docs/almacenamiento-r2.md
//
//   node --env-file=.env.local scripts/migrate-storage-to-r2.mjs <orden> [opciones]
//
// Órdenes (todas en seco salvo que lleven --apply):
//   plan             Qué se copiaría y cuánto ocupa. No escribe nada. (por defecto)
//   copy             Copia a R2 y actualiza la BD fila a fila. Reanudable: lo que ya
//                    apunta a R2 se salta; si se corta, se vuelve a lanzar igual.
//   verify           Comprueba que cada fila que apunta a R2 tiene su archivo allí.
//   rollback         Devuelve a Supabase las filas copiadas (mientras no se haya borrado nada).
//   delete-supabase  Borra de Supabase solo lo que está copiado y comprobado en R2.
//                    Exige --apply y --yes-delete.
//
// Opciones:
//   --apply              Ejecuta de verdad (sin esto, solo informa).
//   --only=checkin,chat,avatars,orphans   Limita los tipos.
//   --limit=N            Procesa como mucho N archivos (para probar con pocos).
//   --backup-dir=DIR     Guarda también el original en DIR/<bucket>/<ruta> (recomendado).
//   --keep-format        Copia los originales sin convertir a WebP.
//   --log=FICHERO        Registro de lo copiado (por defecto r2-migration-log.jsonl).
//                        delete-supabase y rollback lo necesitan: no lo borres.
//
// Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ENDPOINT,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL, R2_PRIVATE_BUCKET.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import {
  AVATAR_MAX_SIDE,
  MEDIA_IMAGE_MAX_SIDE,
  MEDIA_WEBP_QUALITY,
  shouldPrepareImage,
} from '../src/lib/chat-image-rules.js'
import {
  R2_BUCKET_MARKER,
  R2_REF_PREFIX,
  parsePrivateKey,
  sanitizeFileName,
  withExtension,
} from '../src/lib/storage/media-refs.js'

// ---------------------------------------------------------------------------
// Argumentos y configuración
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const command = args.find(a => !a.startsWith('--')) ?? 'plan'
const flag = (name) => args.includes(`--${name}`)
const option = (name) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const APPLY = flag('apply')
const KEEP_FORMAT = flag('keep-format')
const LIMIT = option('limit') ? Number(option('limit')) : Infinity
const BACKUP_DIR = option('backup-dir')
const LOG_FILE = option('log') ?? 'r2-migration-log.jsonl'
const ONLY = new Set((option('only') ?? 'checkin,chat,avatars,orphans').split(','))
const CONCURRENCY = 4

const COMMANDS = ['plan', 'copy', 'verify', 'rollback', 'delete-supabase']
if (!COMMANDS.includes(command)) {
  console.error(`Orden desconocida «${command}». Usa: ${COMMANDS.join(', ')}`)
  process.exit(1)
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Falta la variable ${name} (¿has pasado --env-file=.env.local?)`)
    process.exit(1)
  }
  return value
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '')
const supabase = createClient(SUPABASE_URL, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
const s3 = new S3Client({
  region: 'auto',
  endpoint: requireEnv('R2_ENDPOINT'),
  credentials: { accessKeyId: requireEnv('R2_ACCESS_KEY_ID'), secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY') },
})
const PUBLIC_BUCKET = requireEnv('R2_BUCKET')
const PUBLIC_URL = requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '')
const PRIVATE_BUCKET = process.env.R2_PRIVATE_BUCKET?.trim() || null

if (PRIVATE_BUCKET === PUBLIC_BUCKET) {
  console.error('R2_PRIVATE_BUCKET no puede ser el bucket público: las fotos privadas quedarían a la vista en R2_PUBLIC_URL.')
  process.exit(1)
}

const SUPABASE_AVATAR_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/avatars/`
const BUCKETS = ['checkin-media', 'chat-media', 'avatars']

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function pool(items, worker) {
  let index = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

/** Lista todos los objetos de un bucket de Supabase (recorre las carpetas). */
async function listSupabaseObjects(bucket, prefix = '') {
  const found = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`No se pudo listar ${bucket}/${prefix}: ${error.message}`)
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) found.push(...await listSupabaseObjects(bucket, path))
      else if (entry.name !== '.emptyFolderPlaceholder') {
        found.push({ bucket, path, size: Number(entry.metadata?.size ?? 0), mime: entry.metadata?.mimetype ?? 'application/octet-stream' })
      }
    }
    if (data.length < 1000) break
  }
  return found
}

async function selectAll(build) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function r2Head(bucket, key) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { size: Number(head.ContentLength ?? 0), type: head.ContentType ?? null }
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return null
    throw error
  }
}

async function download(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) throw new Error(`No se pudo descargar ${bucket}/${path}: ${error?.message ?? 'vacío'}`)
  return new Uint8Array(await data.arrayBuffer())
}

async function toWebp(input, maxSide) {
  try {
    const output = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: MEDIA_WEBP_QUALITY })
      .toBuffer()
    return new Uint8Array(output)
  } catch {
    return null
  }
}

function readLog() {
  if (!existsSync(LOG_FILE)) return []
  return readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function writeLog(entry) {
  appendFileSync(LOG_FILE, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n')
}

function backup(bucket, path, bytes) {
  if (!BACKUP_DIR) return
  const target = join(BACKUP_DIR, bucket, path)
  if (existsSync(target)) return
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
}

// ---------------------------------------------------------------------------
// Inventario: qué hay en Supabase y quién lo usa
// ---------------------------------------------------------------------------

async function inventory() {
  const [checkinRows, messageRows, avatarRows] = await Promise.all([
    selectAll(() => supabase.from('checkin_media').select('id, bucket, path, mime_type, file_size_bytes').eq('bucket', 'checkin-media').order('id')),
    selectAll(() => supabase.from('messages').select('id, coach_id, client_id, attachment_url, attachment_mime').not('attachment_url', 'is', null).not('attachment_url', 'like', `${R2_REF_PREFIX}%`).order('id')),
    selectAll(() => supabase.from('profiles').select('id, avatar_url').like('avatar_url', `${SUPABASE_AVATAR_PREFIX}%`).order('id')),
  ])

  const objects = new Map()
  for (const bucket of BUCKETS) {
    for (const object of await listSupabaseObjects(bucket)) objects.set(`${bucket}/${object.path}`, object)
  }

  const tasks = []
  const referenced = new Set()
  const missing = []

  for (const row of checkinRows) {
    const object = objects.get(`checkin-media/${row.path}`)
    referenced.add(`checkin-media/${row.path}`)
    if (!object) { missing.push(`checkin_media ${row.id}: checkin-media/${row.path}`); continue }
    tasks.push({ type: 'checkin', row, object })
  }
  for (const row of messageRows) {
    const object = objects.get(`chat-media/${row.attachment_url}`)
    referenced.add(`chat-media/${row.attachment_url}`)
    if (!object) { missing.push(`messages ${row.id}: chat-media/${row.attachment_url}`); continue }
    tasks.push({ type: 'chat', row, object })
  }
  for (const row of avatarRows) {
    const path = decodeURIComponent(row.avatar_url.slice(SUPABASE_AVATAR_PREFIX.length).split('?')[0])
    const object = objects.get(`avatars/${path}`)
    referenced.add(`avatars/${path}`)
    if (!object) { missing.push(`profiles ${row.id}: avatars/${path}`); continue }
    tasks.push({ type: 'avatars', row, object })
  }
  for (const [id, object] of objects) {
    if (!referenced.has(id)) tasks.push({ type: 'orphans', row: null, object })
  }

  return { tasks: tasks.filter(t => ONLY.has(t.type)), objects, missing }
}

// ---------------------------------------------------------------------------
// Destino en R2 de cada archivo (determinista: repetir la copia es inofensivo)
// ---------------------------------------------------------------------------

function target(task, convert) {
  const { type, object } = task
  const segments = object.path.split('/')
  const fileName = sanitizeFileName(segments.pop())
  const finalName = convert ? withExtension(fileName, 'webp') : fileName

  if (type === 'checkin') {
    const key = `checkin-media/${[...segments, finalName].join('/')}`
    return parsePrivateKey(key) ? { bucket: PRIVATE_BUCKET, key } : null
  }
  if (type === 'chat') {
    const key = `chat-media/${[...segments, finalName].join('/')}`
    return parsePrivateKey(key) ? { bucket: PRIVATE_BUCKET, key } : null
  }
  if (type === 'avatars') return { bucket: PUBLIC_BUCKET, key: `avatars/${[...segments, finalName].join('/')}` }
  // Huérfanos: sin fila en la BD, se guardan tal cual y en privado
  return { bucket: PRIVATE_BUCKET, key: `orphans/${object.bucket}/${object.path}` }
}

function wantsConversion(task) {
  return !KEEP_FORMAT
    && (task.type === 'checkin' || task.type === 'avatars')
    && shouldPrepareImage(task.object.mime, task.object.path)
}

// ---------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------

async function runPlan() {
  const { tasks, objects, missing } = await inventory()
  const totals = {}
  let bytes = 0
  for (const task of tasks) {
    totals[task.type] ??= { count: 0, bytes: 0 }
    totals[task.type].count++
    totals[task.type].bytes += task.object.size
    bytes += task.object.size
  }
  const allBytes = [...objects.values()].reduce((sum, o) => sum + o.size, 0)
  console.log(`Supabase Storage: ${objects.size} archivos, ${mb(allBytes)}`)
  console.log(`Pendientes de copiar a R2 (${[...ONLY].join(', ')}): ${tasks.length} archivos, ${mb(bytes)}`)
  for (const [type, t] of Object.entries(totals)) console.log(`  ${type.padEnd(8)} ${String(t.count).padStart(4)} archivos  ${mb(t.bytes)}`)
  if (missing.length) {
    console.log(`\nFilas que apuntan a archivos que no existen en Supabase (se dejan como están): ${missing.length}`)
    missing.slice(0, 10).forEach(m => console.log(`  ${m}`))
  }
  console.log('\nEjemplos de destino:')
  for (const task of tasks.slice(0, 5)) {
    const to = target(task, wantsConversion(task))
    console.log(`  ${task.object.bucket}/${task.object.path}  →  ${to ? `${to.bucket ?? '(sin R2_PRIVATE_BUCKET)'}:${to.key}` : 'RUTA NO VÁLIDA, se salta'}`)
  }
  if (!PRIVATE_BUCKET) console.log('\nAVISO: falta R2_PRIVATE_BUCKET; check-ins, chat y huérfanos no se pueden copiar todavía.')
  await checkR2Access()
}

async function checkR2Access() {
  for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET].filter(Boolean)) {
    try {
      await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))
      console.log(`R2: acceso correcto a «${bucket}»`)
    } catch (error) {
      console.log(`R2: SIN acceso a «${bucket}» (${error.name}). Revisa el token.`)
    }
  }
}

async function runCopy() {
  const { tasks } = await inventory()
  const selected = tasks.slice(0, LIMIT)
  const needsPrivate = selected.some(t => t.type !== 'avatars')
  if (needsPrivate && !PRIVATE_BUCKET) {
    console.error('Falta R2_PRIVATE_BUCKET (bucket R2 sin acceso público). Usa --only=avatars o configúralo.')
    process.exit(1)
  }
  console.log(`${APPLY ? 'Copiando' : '[EN SECO] Se copiarían'} ${selected.length} archivos${BACKUP_DIR ? `, con copia local en ${BACKUP_DIR}` : ''}…`)

  const stats = { done: 0, skipped: 0, failed: 0, before: 0, after: 0 }
  await pool(selected, async (task) => {
    const { object } = task
    const label = `${object.bucket}/${object.path}`
    try {
      const convert = wantsConversion(task)
      let to = target(task, convert)
      if (!to) { stats.skipped++; console.log(`  SALTADO (ruta no válida) ${label}`); return }
      if (!APPLY) { stats.done++; stats.before += object.size; return }

      const original = await download(object.bucket, object.path)
      backup(object.bucket, object.path, original)

      let body = original
      let mime = object.mime
      if (convert) {
        const webp = await toWebp(original, task.type === 'avatars' ? AVATAR_MAX_SIDE : MEDIA_IMAGE_MAX_SIDE)
        if (webp) { body = webp; mime = 'image/webp' } else { to = target(task, false) }
      }

      await s3.send(new PutObjectCommand({
        Bucket: to.bucket,
        Key: to.key,
        Body: body,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { 'source': label },
      }))
      const head = await r2Head(to.bucket, to.key)
      if (!head || head.size !== body.byteLength) throw new Error('la copia en R2 no coincide en tamaño')

      await pointDatabaseToR2(task, to, mime, body.byteLength)
      writeLog({ type: task.type, id: task.row?.id ?? null, from: { bucket: object.bucket, path: object.path, mime: object.mime }, to, before: original.byteLength, after: body.byteLength })
      stats.done++
      stats.before += original.byteLength
      stats.after += body.byteLength
      if (stats.done % 25 === 0) console.log(`  … ${stats.done}/${selected.length}`)
    } catch (error) {
      stats.failed++
      console.error(`  ERROR ${label}: ${error.message}`)
    }
  })

  console.log(`\n${APPLY ? 'Copiados' : 'Se copiarían'}: ${stats.done}  Saltados: ${stats.skipped}  Errores: ${stats.failed}`)
  if (APPLY) console.log(`Tamaño: ${mb(stats.before)} en Supabase → ${mb(stats.after)} en R2. Registro: ${LOG_FILE}`)
  else console.log(`Tamaño en Supabase: ${mb(stats.before)}. Añade --apply para copiar.`)
  if (stats.failed) process.exitCode = 1
}

/** Cambia la fila solo si sigue apuntando al archivo de Supabase (nadie la ha tocado). */
async function pointDatabaseToR2(task, to, mime, size) {
  const { type, row, object } = task
  let result
  if (type === 'checkin') {
    result = await supabase.from('checkin_media')
      .update({ bucket: R2_BUCKET_MARKER, path: to.key, mime_type: mime, file_size_bytes: size })
      .eq('id', row.id).eq('bucket', 'checkin-media').eq('path', object.path).select('id')
  } else if (type === 'chat') {
    result = await supabase.from('messages')
      .update({ attachment_url: `${R2_REF_PREFIX}${to.key}`, attachment_mime: mime, attachment_size: size })
      .eq('id', row.id).eq('attachment_url', object.path).select('id')
  } else if (type === 'avatars') {
    result = await supabase.from('profiles')
      .update({ avatar_url: `${PUBLIC_URL}/${to.key}` })
      .eq('id', row.id).eq('avatar_url', row.avatar_url).select('id')
  } else {
    return
  }
  if (result.error) throw new Error(`BD: ${result.error.message}`)
  if (!result.data?.length) throw new Error('la fila cambió mientras se copiaba; se reintentará en la próxima pasada')
}

async function runVerify() {
  const [checkinRows, messageRows, avatarRows] = await Promise.all([
    selectAll(() => supabase.from('checkin_media').select('id, path').eq('bucket', R2_BUCKET_MARKER).order('id')),
    selectAll(() => supabase.from('messages').select('id, attachment_url').like('attachment_url', `${R2_REF_PREFIX}%`).order('id')),
    selectAll(() => supabase.from('profiles').select('id, avatar_url').like('avatar_url', `${PUBLIC_URL}/%`).order('id')),
  ])
  const checks = [
    ...checkinRows.map(r => ({ what: `checkin_media ${r.id}`, bucket: PRIVATE_BUCKET, key: r.path })),
    ...messageRows.map(r => ({ what: `messages ${r.id}`, bucket: PRIVATE_BUCKET, key: r.attachment_url.slice(R2_REF_PREFIX.length) })),
    ...avatarRows.map(r => ({ what: `profiles ${r.id}`, bucket: PUBLIC_BUCKET, key: r.avatar_url.slice(PUBLIC_URL.length + 1) })),
  ]
  const missing = []
  await pool(checks, async (check) => {
    const head = check.bucket ? await r2Head(check.bucket, check.key) : null
    if (!head || head.size === 0) missing.push(check)
  })
  const { count: legacyCheckins } = await supabase.from('checkin_media').select('id', { count: 'exact', head: true }).eq('bucket', 'checkin-media')
  console.log(`Filas que apuntan a R2: ${checks.length} (check-ins ${checkinRows.length}, chat ${messageRows.length}, avatares ${avatarRows.length})`)
  console.log(`Sin archivo en R2: ${missing.length}`)
  missing.slice(0, 20).forEach(m => console.log(`  ${m.what}: ${m.key}`))
  console.log(`Check-ins que siguen en Supabase: ${legacyCheckins ?? '?'}`)
  if (checkinRows[0]) console.log(`\nPrueba en el navegador (con sesión de coach): /api/media/${checkinRows[0].path}`)
  if (missing.length) process.exitCode = 1
}

async function runRollback() {
  const entries = readLog().filter(e => e.type !== 'orphans' && ONLY.has(e.type))
  console.log(`${APPLY ? 'Devolviendo' : '[EN SECO] Se devolverían'} ${entries.length} filas a Supabase…`)
  let done = 0
  for (const entry of entries) {
    const { data: stillThere } = await supabase.storage.from(entry.from.bucket).list(dirname(entry.from.path), { search: entry.from.path.split('/').pop() })
    if (!stillThere?.length) { console.log(`  NO SE PUEDE: ya no está en Supabase ${entry.from.bucket}/${entry.from.path}`); continue }
    if (!APPLY) { done++; continue }
    let result
    if (entry.type === 'checkin') {
      result = await supabase.from('checkin_media')
        .update({ bucket: 'checkin-media', path: entry.from.path, mime_type: entry.from.mime ?? null, file_size_bytes: entry.before })
        .eq('id', entry.id).eq('bucket', R2_BUCKET_MARKER).eq('path', entry.to.key).select('id')
    } else if (entry.type === 'chat') {
      result = await supabase.from('messages')
        .update({ attachment_url: entry.from.path, attachment_mime: entry.from.mime ?? null, attachment_size: entry.before })
        .eq('id', entry.id).eq('attachment_url', `${R2_REF_PREFIX}${entry.to.key}`).select('id')
    } else {
      result = await supabase.from('profiles')
        .update({ avatar_url: `${SUPABASE_AVATAR_PREFIX}${entry.from.path}` })
        .eq('id', entry.id).eq('avatar_url', `${PUBLIC_URL}/${entry.to.key}`).select('id')
    }
    if (result.error) console.log(`  ERROR ${entry.type} ${entry.id}: ${result.error.message}`)
    else if (result.data?.length) done++
  }
  console.log(`${APPLY ? 'Devueltas' : 'Se devolverían'}: ${done}. Los archivos de R2 se quedan (no molestan).`)
}

async function runDeleteSupabase() {
  if (APPLY && !flag('yes-delete')) {
    console.error('Borrar de Supabase no se puede deshacer. Añade --yes-delete además de --apply.')
    process.exit(1)
  }
  const log = new Map(readLog().map(e => [`${e.from.bucket}/${e.from.path}`, e]))
  const objects = []
  for (const bucket of BUCKETS) objects.push(...await listSupabaseObjects(bucket))

  const deletable = []
  const kept = []
  await pool(objects, async (object) => {
    const id = `${object.bucket}/${object.path}`
    const entry = log.get(id)
    if (!entry) { kept.push(`${id} (no está en el registro de copia)`); return }
    const head = await r2Head(entry.to.bucket, entry.to.key)
    if (!head || head.size === 0) { kept.push(`${id} (no está en R2)`); return }
    if (!(await databaseStillPointsToR2(entry))) { kept.push(`${id} (la BD ya no apunta a R2)`); return }
    deletable.push(object)
  })

  const bytes = deletable.reduce((sum, o) => sum + o.size, 0)
  console.log(`${APPLY ? 'Borrando' : '[EN SECO] Se borrarían'} ${deletable.length} de ${objects.length} archivos de Supabase (${mb(bytes)}).`)
  if (kept.length) {
    console.log(`Se conservan ${kept.length}:`)
    kept.slice(0, 20).forEach(k => console.log(`  ${k}`))
  }
  if (!APPLY) return

  for (const bucket of BUCKETS) {
    const paths = deletable.filter(o => o.bucket === bucket).map(o => o.path)
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
      if (error) console.error(`  ERROR al borrar en ${bucket}: ${error.message}`)
    }
  }
  console.log('Hecho. El uso de Storage en el panel de Supabase puede tardar un rato en actualizarse.')
}

async function databaseStillPointsToR2(entry) {
  if (entry.type === 'orphans') return true
  let query
  if (entry.type === 'checkin') {
    query = supabase.from('checkin_media').select('id, bucket, path').eq('id', entry.id).maybeSingle()
  } else if (entry.type === 'chat') {
    query = supabase.from('messages').select('id, attachment_url').eq('id', entry.id).maybeSingle()
  } else {
    query = supabase.from('profiles').select('id, avatar_url').eq('id', entry.id).maybeSingle()
  }
  const { data, error } = await query
  if (error) return false
  if (!data) return true // la fila se borró después: el archivo ya no hace falta
  if (entry.type === 'checkin') return data.bucket === R2_BUCKET_MARKER
  if (entry.type === 'chat') return data.attachment_url?.startsWith(R2_REF_PREFIX)
  // El usuario puede haber cambiado de foto: lo que importa es que ya no apunte a Supabase
  return !data.avatar_url?.startsWith(SUPABASE_AVATAR_PREFIX)
}

const runners = { plan: runPlan, copy: runCopy, verify: runVerify, rollback: runRollback, 'delete-supabase': runDeleteSupabase }
await runners[command]()
