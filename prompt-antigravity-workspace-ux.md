# Prompt Antigravity — Mejoras UX Workspace (`/coach/clients`)

## Contexto del proyecto

NextTrain es un SaaS de coaching para entrenadores personales. Estás trabajando en la página **Workspace** (`/coach/clients`), que es el centro operativo donde el coach gestiona a cada cliente individualmente.

### Stack técnico

- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript
- **Estilos**: Tailwind CSS 3
- **UI Library**: shadcn/ui (Radix UI primitives + class-variance-authority)
- **Iconos**: lucide-react
- **Backend/DB**: Supabase (PostgreSQL 17) con RLS
- **Data fetching**: Server Components + Supabase SSR + TanStack React Query
- **Charts**: recharts
- **Forms**: react-hook-form + zod
- **Fechas**: date-fns con locale español (`es`)

### Archivos relevantes

| Archivo | Descripción |
|---------|-------------|
| `app/(coach)/coach/clients/page.tsx` | Server Component principal — fetch de datos + render de `<NewClientWorkspace>` |
| `src/components/coach/NewClientWorkspace.tsx` | Client Component orquestador — tabs, client selector, debug panel |
| `src/components/coach/workspace/WorkspaceClient.tsx` | **CÓDIGO MUERTO** — versión antigua del orquestador, ya no se usa |
| `src/components/coach/workspace/WorkspaceHeader.tsx` | Header del cliente seleccionado — avatar, badges, botones Editar/Dar de baja |
| `src/components/coach/workspace/ClientSelector.tsx` | Combobox para cambiar de cliente — usa Command de shadcn |
| `src/components/coach/workspace/ResumenTab.tsx` | Pestaña Resumen — StatusCard, ReviewCard, ActivePlanCards |
| `src/components/coach/workspace/CheckinsTab.tsx` | Pestaña Revisiones — lista de check-ins + panel de detalle |
| `src/components/coach/workspace/PlanTab.tsx` | Pestaña Plan — sub-tabs Planificación/Fuerza/Nutrición |
| `src/components/coach/workspace/ProgresoTab.tsx` | Pestaña Progreso — KPIs + gráficos de evolución |
| `src/components/coach/workspace/OnboardingTab.tsx` | Pestaña Onboarding |
| `src/data/workspace.ts` | Data layer — todas las funciones de fetch del workspace |
| `src/types/coach.ts` | Tipos TypeScript compartidos |

---

## MEJORAS A IMPLEMENTAR

Implementa las siguientes 6 mejoras de UX. Cada mejora es independiente. Trabaja una por una, haciendo commit mental de cada cambio antes de pasar a la siguiente.

---

### Mejora 4 · Header del cliente: acciones peligrosas accesibles + textos en inglés

**Archivo**: `src/components/coach/workspace/WorkspaceHeader.tsx`

**Problema**:
1. El botón "Dar de baja" (acción destructiva) está al mismo nivel visual que "Editar", facilitando clics accidentales.
2. Hay textos en inglés que rompen la consistencia del idioma: "This client hasn't signed up yet", "Send an invite and wait for them to create their account. All planning features are disabled until then.", "Pending signup", "Invite resent ✓", "Failed to resend invite", "Resend invite".
3. La fecha `next_checkin_date` se muestra en formato raw ISO (`2026-03-15`) en vez de formato legible.

**Cambios requeridos**:

1. **Mover "Dar de baja" / "Reactivar" dentro de un DropdownMenu** (shadcn `DropdownMenu`). Reemplazar el botón directo por un botón con ícono `MoreVertical` (tres puntos `⋮`) que abra un dropdown con las opciones:
   - "Editar cliente" (abre el EditClientModal)
   - Separador
   - "Dar de baja" (destructivo, texto rojo) o "Reactivar" (texto verde) según el estado actual
   - Mantener el botón "Editar" como acción primaria visible y el dropdown como secundario

2. **Traducir TODOS los textos al español**:
   - `"This client hasn't signed up yet"` → `"Este cliente aún no se ha registrado"`
   - `"Send an invite and wait for them to create their account. All planning features are disabled until then."` → `"Envía una invitación y espera a que cree su cuenta. Las funciones de planificación estarán deshabilitadas hasta entonces."`
   - `"Pending signup"` → `"Registro pendiente"`
   - `"Invite resent ✓"` → `"Invitación reenviada ✓"`
   - `"Invitation resent to ${client.email}"` → `"Se ha reenviado la invitación a ${client.email}"`
   - `"Failed to resend invite"` → `"Error al reenviar invitación"`
   - `"Resend invite"` → `"Reenviar invitación"`

3. **Formatear `next_checkin_date`** usando `format` de `date-fns` con locale `es`:
   ```tsx
   import { format, parseISO } from 'date-fns'
   import { es } from 'date-fns/locale'

   // En el render:
   {client.next_checkin_date
     ? format(parseISO(client.next_checkin_date), "EEE d 'de' MMM", { locale: es })
     : 'Sin fecha'}
   ```
   Ejemplo de output: `"sáb 15 de mar"` en vez de `"2026-03-15"`.

4. **Traducir también en `NewClientWorkspace.tsx`** el componente `BlockedTabContent`:
   - `"Feature locked"` → `"Función bloqueada"`
   - `"This client hasn't signed up yet. Planning features will be unlocked once they create their account through the invitation link."` → `"Este cliente aún no se ha registrado. Las funciones de planificación se desbloquearán cuando cree su cuenta a través del enlace de invitación."`

**Resultado esperado**: Las acciones destructivas están protegidas detrás de un menú, toda la UI está en español, y las fechas son legibles.

---

### Mejora 7 · Eliminar "Ver datos raw" de la vista del coach

**Archivos**: `src/components/coach/workspace/CheckinsTab.tsx`

**Problema**: El `<details>Ver datos raw</details>` en `CheckinDetailPanel` muestra un JSON crudo (`raw_payload`) que es puro debugging de desarrollador. No aporta valor al coach y puede confundir.

**Cambios requeridos**:

1. **Envolver el bloque de "Ver datos raw" en una condición de entorno**:
   ```tsx
   {/* Raw Payload — solo visible en desarrollo */}
   {process.env.NODE_ENV !== 'production' && checkin.raw_payload && (
     <details className="text-xs">
       <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
         Ver datos raw (dev)
       </summary>
       <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
         {JSON.stringify(checkin.raw_payload, null, 2)}
       </pre>
     </details>
   )}
   ```

2. **En producción, si hay campos extra en `raw_payload`** que no se muestran en las MetricBox (ej: `stress_level`, `energy_level`, `hydration`, etc.), renderizarlos como MetricBoxes adicionales. Para esto:
   - Define un set de campos ya cubiertos: `['weight_avg_kg', 'weight_kg', 'steps_avg', 'sleep_avg_h', 'training_adherence_pct', 'nutrition_adherence_pct']`
   - Filtra `raw_payload` para obtener campos extra con valor numérico
   - Renderiza cada campo extra como un `<MetricBox>` con label = key formateada (snake_case → Title Case), icon = `Activity`
   - Solo si hay campos extra, mostrar una sección "Otros datos" debajo de las métricas principales

**Resultado esperado**: En producción, el JSON raw desaparece. Campos extra se muestran como métricas legibles. En dev, sigue visible para debugging.

---

### Mejora 8 · Indicador de urgencia en el selector de clientes

**Archivo**: `src/components/coach/workspace/ClientSelector.tsx`

**Problema**: El selector de clientes muestra nombre + email + badge Activo/Inactivo, pero no indica si un cliente tiene check-ins pendientes de revisión. El coach no puede priorizar sin abrir cada cliente.

**Cambios requeridos**:

1. **Extender la interfaz `ClientOption`** para incluir datos de urgencia:
   ```tsx
   interface ClientOption {
     id: string
     full_name?: string | null
     email: string
     status: string | null
     hasOverdueCheckin?: boolean      // check-in atrasado (más de X días sin hacerlo)
     hasPendingReview?: boolean       // check-in enviado pero sin review del coach
   }
   ```

2. **Modificar `getClientsForSelector` en `src/data/workspace.ts`** para enriquecer cada cliente con estos datos:
   - `hasOverdueCheckin`: true si `daysUntilCheckin < 0` (calculado igual que en `getClientStatus`)
   - `hasPendingReview`: true si el último check-in no tiene review asociado (o tiene review en status `draft`)

3. **Renderizar un dot de urgencia** en cada `CommandItem` del dropdown:
   ```tsx
   {/* Dot de urgencia */}
   {client.hasPendingReview && (
     <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Review pendiente" />
   )}
   {client.hasOverdueCheckin && (
     <span className="w-2 h-2 rounded-full bg-destructive shrink-0 animate-pulse" title="Check-in atrasado" />
   )}
   ```
   Colocar el dot entre las iniciales y el nombre. Si tiene ambos flags, priorizar el rojo (overdue).

4. **En el botón trigger** (el combobox cerrado), también mostrar el dot junto al nombre del cliente seleccionado.

**Resultado esperado**: El coach ve de un vistazo qué clientes necesitan atención al abrir el selector. Rojo = atrasado, ámbar = review pendiente.

---

### Mejora 9 · Aplanar la navegación del Plan (eliminar 1 nivel de tabs)

**Archivos**: `src/components/coach/workspace/PlanTab.tsx`, y posiblemente `PlanningTab.tsx`

**Problema**: La pestaña Plan tiene 3 niveles de navegación anidados: Tab principal (Plan) → Sub-tab (Planificación/Fuerza/Nutrición) → Sub-sub-tab en Nutrición (Objetivos & Macros / Dieta por Opciones). Son demasiados niveles, especialmente en móvil.

**Cambios requeridos**:

1. **Reestructurar PlanTab** para que "Planificación" (el calendario semanal) sea la vista principal sin ser un sub-tab. Es decir, el calendario se muestra siempre arriba.

2. **Convertir "Fuerza" y "Nutrición" en secciones colapsables** debajo del calendario:
   ```tsx
   <div className="space-y-6">
     {/* Calendario semanal — siempre visible */}
     <PlanningCalendar ... />

     {/* Sección Programa de Fuerza — colapsable */}
     <Collapsible defaultOpen>
       <CollapsibleTrigger className="flex items-center justify-between w-full p-4 ...">
         <div className="flex items-center gap-2">
           <Dumbbell className="h-5 w-5 text-primary" />
           <h3 className="font-semibold">Programa de fuerza</h3>
           {activeProgram && <Badge variant="secondary">Activo</Badge>}
         </div>
         <ChevronDown className="h-4 w-4" />
       </CollapsibleTrigger>
       <CollapsibleContent>
         {/* Contenido actual de la sub-tab Fuerza */}
       </CollapsibleContent>
     </Collapsible>

     {/* Sección Nutrición — colapsable */}
     <Collapsible>
       <CollapsibleTrigger className="...">
         <div className="flex items-center gap-2">
           <Apple className="h-5 w-5 text-primary" />
           <h3 className="font-semibold">Nutrición</h3>
         </div>
         <ChevronDown className="h-4 w-4" />
       </CollapsibleTrigger>
       <CollapsibleContent>
         {/* Contenido actual de las sub-tabs de Nutrición */}
         {/* Aquí sí se puede mantener un tab interno Macros / Dieta por Opciones */}
       </CollapsibleContent>
     </Collapsible>
   </div>
   ```

3. **Usar `Collapsible` de shadcn/ui** (import de `@/components/ui/collapsible`). Si no existe el componente, instalarlo: `npx shadcn-ui@latest add collapsible`.

4. **En móvil**, las secciones colapsables son ideales porque el coach puede scrollear linealmente sin perderse en sub-tabs.

**Resultado esperado**: El calendario semanal es lo primero que ve el coach. Fuerza y Nutrición están debajo como secciones expandibles. Se elimina un nivel completo de navegación.

---

### Mejora 10 · Navegación rápida entre clientes (flechas prev/next)

**Archivos**: `src/components/coach/workspace/ClientSelector.tsx`, `src/components/coach/NewClientWorkspace.tsx`

**Problema**: Para cambiar de cliente, el coach tiene que abrir el dropdown, buscar y seleccionar. Si está revisando check-ins de múltiples clientes seguidos, esto es tedioso.

**Cambios requeridos**:

1. **Añadir botones `←` y `→`** al lado del `ClientSelector`:
   ```tsx
   // En NewClientWorkspace.tsx, alrededor del ClientSelector:
   <div className="flex items-center gap-2">
     <Button
       variant="ghost"
       size="icon"
       onClick={handlePrevClient}
       disabled={!canGoPrev}
       title="Cliente anterior"
       className="h-8 w-8"
     >
       <ChevronLeft className="h-4 w-4" />
     </Button>

     <ClientSelector
       clients={clients}
       selectedClientId={selectedClientId}
     />

     <Button
       variant="ghost"
       size="icon"
       onClick={handleNextClient}
       disabled={!canGoNext}
       title="Siguiente cliente"
       className="h-8 w-8"
     >
       <ChevronRight className="h-4 w-4" />
     </Button>

     {/* Indicador de posición */}
     <span className="text-xs text-muted-foreground hidden sm:inline">
       {currentIndex + 1}/{activeClients.length}
     </span>
   </div>
   ```

2. **Implementar la lógica de navegación** en `NewClientWorkspace.tsx`:
   ```tsx
   const activeClients = useMemo(() =>
     clients.filter(c => c.status === 'active'),
     [clients]
   )

   const currentIndex = activeClients.findIndex(c => c.id === selectedClientId)
   const canGoPrev = currentIndex > 0
   const canGoNext = currentIndex < activeClients.length - 1

   const handlePrevClient = () => {
     if (canGoPrev) {
       router.push(`/coach/clients?client=${activeClients[currentIndex - 1].id}&tab=${activeTab}`)
     }
   }

   const handleNextClient = () => {
     if (canGoNext) {
       router.push(`/coach/clients?client=${activeClients[currentIndex + 1].id}&tab=${activeTab}`)
     }
   }
   ```

3. **Mantener la pestaña actual** al cambiar de cliente (ya se hace con `&tab=${activeTab}` en la URL).

4. **Soporte keyboard**: Añadir un `useEffect` que escuche `Alt+←` y `Alt+→` para navegar:
   ```tsx
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       if (e.altKey && e.key === 'ArrowLeft') handlePrevClient()
       if (e.altKey && e.key === 'ArrowRight') handleNextClient()
     }
     window.addEventListener('keydown', handler)
     return () => window.removeEventListener('keydown', handler)
   }, [handlePrevClient, handleNextClient])
   ```

**Resultado esperado**: El coach puede pasar al cliente anterior/siguiente con un clic o con `Alt+←`/`Alt+→`. El indicador `3/12` le dice cuántos clientes quedan.

---

### Mejora 11 · Eliminar código muerto (`WorkspaceClient.tsx`)

**Archivo**: `src/components/coach/workspace/WorkspaceClient.tsx`

**Problema**: Este componente es una versión antigua del orquestador del workspace. La página `page.tsx` ahora importa `NewClientWorkspace` (desde `src/components/coach/NewClientWorkspace.tsx`), por lo que `WorkspaceClient.tsx` es código muerto que genera confusión.

**Cambios requeridos**:

1. **Verificar que NINGÚN archivo importa `WorkspaceClient`**:
   - Buscar en todo el proyecto: `grep -r "WorkspaceClient" src/ app/`
   - Si solo aparece en su propia definición, es seguro eliminarlo
   - Si algún otro archivo lo importa, refactorizar para que use `NewClientWorkspace`

2. **Eliminar el archivo** `src/components/coach/workspace/WorkspaceClient.tsx`

3. **Verificar que el build pasa** después de la eliminación: `npm run build`

**Resultado esperado**: El archivo duplicado desaparece. Solo queda un orquestador: `NewClientWorkspace.tsx`.

---

## Reglas generales para todas las mejoras

1. **No rompas nada existente**. Cada mejora es aditiva o de refactor — no elimines funcionalidad visible que el usuario ya tenga.
2. **Mantén el idioma español** en toda la UI (excepto nombres de variables/funciones que van en inglés).
3. **Usa los componentes shadcn/ui existentes** siempre que sea posible (`DropdownMenu`, `Sheet`, `Collapsible`, `Badge`, `Button`, `Command`). Instala nuevos componentes con `npx shadcn-ui@latest add <component>` si es necesario.
4. **Importa íconos de lucide-react** — no uses emojis ni SVGs inline.
5. **Sigue el patrón del proyecto**: Server Components para pages, Client Components (`'use client'`) para interactividad, data functions en `src/data/`, actions en archivos `actions.ts`.
6. **Haz build y comprueba errores** después de cada mejora: `npm run build`.
7. **No modifiques la estructura de la base de datos** (ni tablas, ni políticas RLS).
8. **Usa date-fns con locale `es`** para cualquier formateo de fechas.
