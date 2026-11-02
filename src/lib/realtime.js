let channelSeq = 0

/**
 * Nombre de canal de Realtime único para cada montaje.
 *
 * supabase.channel(nombre) devuelve el canal que ya exista con ese nombre,
 * aunque se esté cerrando: removeChannel() solo lo quita de la lista cuando el
 * servidor confirma la salida. Con un nombre fijo, el siguiente montaje (cambiar
 * de conversación, volver a la pantalla, Strict Mode en desarrollo) recibe ese
 * canal moribundo: .on() lanza «cannot add postgres_changes callbacks … after
 * subscribe()» o subscribe() no hace nada y deja de llegar todo en vivo.
 *
 * El nombre solo identifica el canal en el navegador; lo que se recibe lo
 * decide el filtro de .on(), así que el sufijo no cambia nada más.
 *
 * @param {string} name
 * @returns {string}
 */
export function uniqueChannelName(name) {
  channelSeq += 1
  return `${name}:${channelSeq}`
}

/**
 * Callback para `channel.subscribe()`: llama a `resync` cada vez que el canal
 * vuelve a quedar suscrito tras la primera vez (Realtime se reconecta solo,
 * pero los cambios ocurridos durante el corte se pierden).
 *
 * @param {() => void} resync
 * @returns {(status: string) => void}
 */
export function resyncOnResubscribe(resync) {
  let subscribedOnce = false
  return (status) => {
    if (status !== 'SUBSCRIBED') return
    if (subscribedOnce) resync()
    subscribedOnce = true
  }
}
