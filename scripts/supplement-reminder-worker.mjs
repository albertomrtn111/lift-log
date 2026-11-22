/**
 * Lanza los recordatorios de suplementos a en punto y a y media (no cada minuto: cada pasada son
 * consultas a Supabase y cada consulta deja logs, que cuentan en la cuota).
 *
 * Cada pasada mira la última media hora más un margen: una toma a las 08:15 avisa a las 08:30.
 * Lo que se solapa entre pasadas no se repite (supplement_reminder_deliveries es única por toma).
 * Al arrancar hace una pasada para recoger lo que caiga mientras el contenedor estaba parado.
 */

const DEFAULT_EVERY_MINUTES = 30
/** Segundos después de la hora en punto / y media, para no quedarse en el minuto anterior. */
const SLOT_DELAY_MS = 10_000
/** Minutos de más que mira cada pasada, por si una llega tarde. */
const LOOKBACK_MARGIN_MINUTES = 5
const INITIAL_DELAY_MS = 15_000

function getConfig() {
  const appUrl = (process.env.NEXTTRAIN_INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const secret = process.env.SUPPLEMENT_REMINDER_SECRET || process.env.CRON_SECRET
  const requested = Number(process.env.SUPPLEMENT_REMINDER_EVERY_MINUTES || DEFAULT_EVERY_MINUTES)
  // Tiene que dividir la hora para caer siempre en los mismos minutos (15, 20, 30, 60...).
  const everyMinutes = Number.isInteger(requested) && requested > 0 && requested <= 60 && 60 % requested === 0
    ? requested
    : DEFAULT_EVERY_MINUTES

  if (!appUrl) {
    throw new Error('NEXTTRAIN_INTERNAL_APP_URL o NEXT_PUBLIC_APP_URL no está configurado')
  }

  if (!secret) {
    throw new Error('SUPPLEMENT_REMINDER_SECRET o CRON_SECRET no está configurado')
  }

  const lookback = everyMinutes + LOOKBACK_MARGIN_MINUTES
  return {
    endpoint: `${appUrl}/api/supplements/reminders?lookback=${lookback}`,
    secret,
    everyMinutes,
  }
}

/** Milisegundos hasta la próxima pasada (múltiplo de `everyMinutes` desde la hora en punto). */
export function msUntilNextSlot(now, everyMinutes) {
  const period = everyMinutes * 60_000
  let next = Math.floor(now / period) * period + SLOT_DELAY_MS
  if (next <= now) next += period
  return next - now
}

const config = getConfig()
let running = false

async function runOnce() {
  if (running) return
  running = true

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secret}`,
      },
    })
    const text = await res.text()

    if (!res.ok) {
      console.error(`[supplement-reminder-worker] ${res.status} ${text}`)
      return
    }

    console.log(`[supplement-reminder-worker] ${text}`)
  } catch (error) {
    console.error('[supplement-reminder-worker] Error ejecutando recordatorios:', error)
  } finally {
    running = false
  }
}

function scheduleNext() {
  setTimeout(async () => {
    await runOnce()
    scheduleNext()
  }, msUntilNextSlot(Date.now(), config.everyMinutes))
}

console.log(`[supplement-reminder-worker] Activo. Endpoint: ${config.endpoint}. Cada ${config.everyMinutes} min, en punto.`)

setTimeout(runOnce, INITIAL_DELAY_MS)
scheduleNext()
