// Instalación inmediata: no esperar a que el usuario cierre pestañas
self.addEventListener('install', (event) => {
    self.skipWaiting()
})

// Activación: tomar control de todas las pestañas abiertas inmediatamente
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
    if (!event.data) return

    let data
    try {
        data = event.data.json()
    } catch {
        data = { title: 'Nueva notificación', body: event.data.text() }
    }

    const options = {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192x192.png',
        // badge eliminado — el archivo badge-72x72.png no existe y puede causar errores en iOS
        tag: data.tag || 'default',
        // Un aviso agrupado que se actualiza a los pocos segundos no vuelve a sonar
        renotify: data.renotify !== false,
        data: {
            url: data.url || '/',
            actionRequest: data.actionRequest || null,
        },
    }
    // Botones (p. ej. «Hecho» en suplementos). iOS no los muestra: el aviso abre la app.
    if (Array.isArray(data.actions) && data.actions.length > 0) {
        options.actions = data.actions
    }

    // Número de avisos sin leer en el icono de la app (si el sistema lo admite)
    const badge = typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator
        ? self.navigator.setAppBadge(data.badge).catch(() => {})
        : Promise.resolve()

    event.waitUntil(
        Promise.all([
            self.registration.showNotification(data.title || 'NexTrain', options),
            badge,
        ])
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification.data?.url || '/'

    // Botón de acción: se resuelve en el servidor sin abrir la app.
    // Si falla (sin sesión, sin red), se abre la pantalla del aviso.
    const request = event.notification.data?.actionRequest
    if (event.action && request?.url) {
        event.waitUntil(
            fetch(request.url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request.body || {}),
            }).then((response) => {
                if (!response.ok) throw new Error(String(response.status))
            }).catch(() => clients.openWindow ? clients.openWindow(url) : undefined)
        )
        return
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(url)
                    return client.focus()
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url)
            }
        })
    )
})
