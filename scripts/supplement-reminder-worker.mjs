const DEFAULT_INTERVAL_MS = 60_000
const INITIAL_DELAY_MS = 15_000

function getConfig() {
  const appUrl = (process.env.NEXTTRAIN_INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const secret = process.env.SUPPLEMENT_REMINDER_SECRET || process.env.CRON_SECRET
  const intervalMs = Number(process.env.SUPPLEMENT_REMINDER_INTERVAL_MS || DEFAULT_INTERVAL_MS)

  if (!appUrl) {
    throw new Error('NEXTTRAIN_INTERNAL_APP_URL o NEXT_PUBLIC_APP_URL no está configurado')
  }

  if (!secret) {
    throw new Error('SUPPLEMENT_REMINDER_SECRET o CRON_SECRET no está configurado')
  }

  return {
    endpoint: `${appUrl}/api/supplements/reminders`,
    secret,
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS,
  }
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

console.log(`[supplement-reminder-worker] Activo. Endpoint: ${config.endpoint}. Intervalo: ${config.intervalMs}ms`)

setTimeout(runOnce, INITIAL_DELAY_MS)
setInterval(runOnce, config.intervalMs)
