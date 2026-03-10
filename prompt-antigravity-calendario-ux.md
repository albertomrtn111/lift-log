# Prompt para Antigravity — Rediseño UX de la Página de Calendario de NextTrain

## Contexto del proyecto

NextTrain es un SaaS de gestión de entrenamiento personal (Coach Portal). El stack es:

- **Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind CSS 3
- **UI Library:** shadcn/ui (Radix UI primitives + class-variance-authority)
- **Icons:** lucide-react
- **Backend/DB:** Supabase (PostgreSQL 17) con RLS habilitado
- **Data fetching:** Server Components con Supabase SSR + TanStack React Query
- **Fechas:** date-fns (ya instalado) + utilidades propias en `src/lib/date-utils.ts`
- **Charts:** recharts (disponible si se necesita)

## Archivos clave del calendario

- **Página:** `app/(coach)/coach/calendar/page.tsx` — Server Component que obtiene los eventos y renderiza `CalendarView`
- **Componente principal:** `src/components/coach/CalendarView.tsx` — Client Component con la grilla del calendario
- **Data layer:** `src/data/calendar.ts` — funciones `getCalendarEvents()`, `getUpcomingCheckins()`, `getClientCheckinHistory()`
- **Tipos:** `src/types/coach.ts` — interfaz `CalendarEvent { id, clientId, clientName, date, type: 'checkin', isUrgent }`
- **Utilidades de fecha:** `src/lib/date-utils.ts` — funciones `toLocalDateStr()`, `parseLocalDate()`

## Tablas de Supabase relevantes

- `clients` — `id`, `coach_id`, `status`, `email`, `full_name`, `next_checkin_date`, `checkin_frequency_days`, `start_date`
- `checkins` — `id`, `client_id`, `coach_id`, `submitted_at`, `date`, `weight_kg`, `training_adherence_pct`, `nutrition_adherence_pct`
- `reviews` — `id`, `checkin_id`, `status` (draft/approved/rejected), `updated_at`

## Problema actual (resumen)

La página de calendario actualmente:
- Solo muestra el `next_checkin_date` de cada cliente, no proyecta check-ins futuros basados en `checkin_frequency_days`
- No muestra check-ins pasados que ya ocurrieron (tabla `checkins`)
- No tiene vista de detalle al clicar en un día
- En mobile se pierden eventos por overflow
- No distingue visualmente entre completados, pendientes y atrasados
- Solo tiene vista mensual (no semanal ni lista)
- La navegación entre meses recarga toda la página

## Tarea

Aplica las siguientes 10 mejoras UX al calendario. Mantén el estilo visual existente (shadcn/ui + Tailwind), la arquitectura del proyecto (Server Components + Client Components, data functions en `src/data/`). No rompas nada que ya funcione.

---

### Mejora 1: Proyectar check-ins recurrentes en todo el mes

**Problema:** `getCalendarEvents()` en `src/data/calendar.ts` solo busca clientes cuyo `next_checkin_date` cae en el mes visible. Si un cliente tiene frecuencia de 7 días y su próximo check-in es el 7 de marzo, solo se ve un evento. Los del 14, 21, 28 no aparecen.

**Qué hacer:**
- Modificar `getCalendarEvents()` para que, además de traer el `next_checkin_date`, proyecte check-ins futuros dentro del mes basándose en `checkin_frequency_days`.
- Lógica: para cada cliente activo, calcular todos los días en los que debería tener check-in dentro del rango del mes. El punto de partida es `next_checkin_date`, y se avanza sumando `checkin_frequency_days` hacia adelante (y hacia atrás si el `next_checkin_date` cae después del inicio del mes).
- Marcar los eventos proyectados con una propiedad nueva, por ejemplo `projected: true`, para distinguirlos de los reales.
- Actualizar el tipo `CalendarEvent` en `src/types/coach.ts` para incluir `projected?: boolean`.

---

### Mejora 2: Mostrar check-ins pasados completados

**Problema:** Los check-ins que ya ocurrieron (registrados en la tabla `checkins` con `submitted_at`) no aparecen en el calendario. El coach no puede ver qué ya se hizo en el mes.

**Qué hacer:**
- En `getCalendarEvents()`, además de los futuros, traer los checkins pasados del mes desde la tabla `checkins` (filtrando por `coach_id` y rango de fechas del mes).
- Para cada checkin pasado, hacer join con `reviews` para saber si tiene review aprobada, draft, o ninguna.
- Ampliar el tipo `CalendarEvent` para incluir un campo `status`: `'completed' | 'pending_review' | 'upcoming' | 'overdue'`.
  - `completed`: checkin recibido + review aprobada
  - `pending_review`: checkin recibido pero review en draft o sin review
  - `upcoming`: checkin programado para el futuro
  - `overdue`: checkin que ya pasó su fecha y no se recibió

---

### Mejora 3: Panel de detalle al clicar en un día

**Problema:** Clicar en una celda vacía o en un día con eventos no hace nada (solo se puede clicar el badge del nombre). No hay forma de ver el detalle de un día.

**Qué hacer:**
- Añadir estado `selectedDate` al componente `CalendarView`.
- Al clicar en cualquier celda del calendario (día), abrir un panel lateral (Drawer en mobile, Sheet en desktop — shadcn/ui ya tiene ambos) que muestre:
  - Fecha seleccionada formateada
  - Lista de todos los clientes de ese día con: nombre, estado del check-in (completado/pendiente/atrasado), última adherencia (training + nutrition), y botón para ir al workspace
  - Si el día está vacío: mostrar "Sin check-ins programados" con un mensaje sutil
- Usar el componente `Sheet` de shadcn/ui (Radix Dialog) que ya está disponible en el proyecto.

---

### Mejora 4: Arreglar overflow de eventos en mobile

**Problema:** En pantallas pequeñas, el `aspect-square` + `overflow-hidden` + `slice(0, 2)` hace que se pierdan eventos sin aviso. El día 14 tenía a Sergio y Alvaro pero en mobile solo se veía Sergio.

**Qué hacer:**
- En mobile (usar Tailwind responsive), cambiar el enfoque: en vez de mostrar badges con nombres, mostrar solo dots de color (un dot por evento) que quepan en el espacio disponible.
- Los dots deben ser clicables (abrir el panel de detalle del día descrito en la mejora 3).
- Asegurar que el indicador "+X más" siempre sea visible cuando hay más eventos de los que caben, NUNCA quedar cortado por overflow.
- En desktop mantener los badges con nombres como ahora.

---

### Mejora 5: Codificación de color por estado

**Problema:** Solo hay dos estados visuales: gris (programado) y rojo (urgente). No se distingue entre completado, pendiente, atrasado.

**Qué hacer:**
- Usar 4 colores distintos para los badges/dots:
  - **Verde** (`bg-success`): check-in completado (recibido + review aprobada)
  - **Amarillo/Ámbar** (`bg-warning`): check-in recibido pero review pendiente
  - **Azul/Gris** (`bg-secondary`): check-in programado futuro (upcoming)
  - **Rojo** (`bg-destructive`): check-in atrasado (overdue, pasó la fecha sin recibir)
- Actualizar la leyenda del calendario para reflejar los 4 estados.
- Estos colores deben ser consistentes en mobile (dots) y desktop (badges).

---

### Mejora 6: Botón "Hoy" más visible y feedback de navegación

**Problema:** El botón "Hoy" es un ghost button pequeño (12px) debajo del nombre del mes. Si navegas a abril, no es obvio cómo volver.

**Qué hacer:**
- Cuando el usuario está viendo un mes que NO es el actual, el botón "Hoy" debe ser más prominente: `variant="default"` o `variant="outline"` con color primario, y tamaño normal (`size="sm"` mínimo).
- Cuando ya estás en el mes actual, el botón puede seguir siendo `ghost` o desaparecer.
- Añadir un indicador sutil en la navegación que diga el mes actual si estás viendo otro: algo como "← Volver a Marzo 2026" debajo de la navegación.

---

### Mejora 7: Optimizar navegación entre meses (evitar recarga completa)

**Problema:** `router.push()` al cambiar de mes hace fetch completo al servidor. Será lento con muchos clientes.

**Qué hacer:**
- Convertir la carga de eventos a client-side: en vez de hacer `router.push` y recargar la page, usar TanStack React Query (ya instalado) o un `fetch` client-side para cargar los eventos del nuevo mes sin recargar la página.
- Crear un API route o Server Action en `app/(coach)/coach/calendar/` que devuelva los eventos para un mes/año dado.
- Mantener la URL actualizada con `window.history.replaceState` o `router.replace` (sin navegar).
- Opcionalmente, precargar el mes anterior y siguiente en paralelo para que la navegación sea instantánea.

---

### Mejora 8: Añadir vista semanal

**Problema:** Solo existe la vista mensual. Para planificación diaria, es poco práctico.

**Qué hacer:**
- Añadir tabs/toggle de "Mes" / "Semana" arriba del calendario.
- La vista semanal muestra 7 columnas (Lun-Dom) pero con mucho más espacio vertical por día.
- Cada día en la vista semanal muestra una lista completa de clientes con: nombre, estado (badge de color), adherencia, y botón de acción directa.
- La semana visible es la que contiene el día de hoy por defecto, con flechas para navegar entre semanas.
- Los datos se obtienen de la misma fuente (`getCalendarEvents`) filtrados por rango de la semana.

---

### Mejora 9: Indicador visual de densidad de carga

**Problema:** Un día con 1 cliente se ve igual que un día con 4 clientes (salvo por los badges internos). El coach no puede ver de un vistazo sus días más cargados.

**Qué hacer:**
- Añadir un fondo de intensidad proporcional al número de check-ins en cada celda:
  - 0 eventos: sin fondo extra
  - 1 evento: `bg-primary/5`
  - 2 eventos: `bg-primary/10`
  - 3+ eventos: `bg-primary/15`
- Esto funciona como un heatmap suave que ayuda a identificar los días más densos.
- No aplicar este fondo en días que ya tienen fondo especial (hoy, urgente).

---

### Mejora 10: Acciones rápidas desde el calendario

**Problema:** Desde el calendario solo puedes ir al workspace del cliente. No puedes ver si el cliente ya envió su formulario ni tomar acciones rápidas.

**Qué hacer:**
- En el panel de detalle del día (mejora 3), junto a cada cliente, mostrar:
  - Si el check-in fue recibido: badge "Recibido" + botón "Ver review" que lleva al workspace en la pestaña de Revisiones.
  - Si el check-in NO fue recibido y ya pasó la fecha: badge "No recibido" en rojo.
  - Si es futuro: badge "Programado" en gris/azul.
- Añadir un link "Ir al workspace →" por cada cliente en el panel.

---

## Reglas generales

1. **No rompas nada existente.** Todo lo que ya funciona debe seguir funcionando.
2. **Mantén la arquitectura:** Server Components para la página, funciones de data en `src/data/calendar.ts`, componentes UI en `src/components/coach/`.
3. **Usa shadcn/ui y Tailwind** para todo el styling. Usa los componentes que ya existen: Sheet, Badge, Button, Card, Tabs, etc.
4. **Mobile-first:** El calendario debe funcionar perfectamente en 390px de ancho. Testea que nada se rompa.
5. **Rendimiento:** Usa `Promise.all` para queries paralelas. Si creas endpoints nuevos, mantenlos ligeros.
6. **TypeScript estricto:** Mantén los tipos. Si amplías `CalendarEvent`, actualiza `src/types/coach.ts`.
7. **date-fns:** Usa `date-fns` con locale `es` para formateo de fechas en español. Ya está instalado.
8. **Prioridad de implementación:** Si necesitas hacer las mejoras incrementalmente, este es el orden recomendado: 1 → 2 → 5 → 3 → 4 → 6 → 10 → 9 → 8 → 7.
