// Textos de los avisos al coach. Puro para probarlo con node --test.

/**
 * «Ana», «Ana y Luis», «Ana, Luis y Marta», «Ana, Luis, Marta y 2 más»
 * @param {Array<string | null | undefined>} names
 * @param {number} [max]
 */
export function formatNameList(names, max = 3) {
  const clean = names.map((name) => String(name ?? '').trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  if (clean.length <= max) return `${clean.slice(0, -1).join(', ')} y ${clean.at(-1)}`
  return `${clean.slice(0, max).join(', ')} y ${clean.length - max} más`
}

/** @param {string | null | undefined} name */
function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || 'Un atleta'
}

/**
 * Aviso de revisiones respondidas. `names` son los atletas que han respondido
 * en la ventana de agrupación, el más reciente primero; `aiReady` indica si el
 * borrador de IA de la más reciente ya está listo.
 * @param {Array<string | null | undefined>} names
 * @param {{ aiReady?: boolean }} [options]
 */
export function buildCheckinReceivedCopy(names, { aiReady = false } = {}) {
  const unique = [...new Set(names.map((name) => String(name ?? '').trim()).filter(Boolean))]
  const count = Math.max(names.length, 1)

  if (count === 1) {
    return {
      title: `${firstName(unique[0])} ha respondido su revisión`,
      body: aiReady
        ? 'El borrador de IA está listo para validar.'
        : 'Ábrela para revisarla y enviarle tu feedback.',
    }
  }

  return {
    title: `${count} revisiones nuevas`,
    body: aiReady
      ? `${formatNameList(unique)}. La última ya tiene borrador de IA.`
      : formatNameList(unique),
  }
}

/** @param {string | null | undefined} name */
export function buildOnboardingCompletedCopy(name) {
  return {
    title: `${firstName(name)} ha completado su formulario inicial`,
    body: 'Ya puedes preparar su primer plan.',
  }
}

/**
 * Mensajes sin leer de un atleta, en un solo aviso por conversación.
 * @param {string | null | undefined} name
 * @param {number} unreadCount
 * @param {string} preview  el último mensaje (o «Nota de voz», «Imagen»…)
 */
export function buildCoachMessageCopy(name, unreadCount, preview) {
  const who = String(name ?? '').trim() || 'Un atleta'
  return {
    title: unreadCount > 1 ? `${who} · ${unreadCount} mensajes nuevos` : `Mensaje de ${who}`,
    body: preview,
  }
}

/** @param {string | null | undefined} name */
export function buildAthleteJoinedCopy(name) {
  return {
    title: `${firstName(name)} ya ha entrado en NexTrain`,
    body: 'Ha abierto la app por primera vez.',
  }
}
