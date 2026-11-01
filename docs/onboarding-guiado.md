# Onboarding guiado (coach + atleta) — análisis y plan

Rama `feature/guided-onboarding` (worktree `lift-log-onboarding`, desde `origin/main`). Nada implementado todavía.

## Cómo funciona hoy

**Alta del coach**
- `/signup` → elige plan → `/signup/details` hace `supabase.auth.signUp` guardando `full_name`, `subscription_tier`, `billing_cycle` en los metadatos del usuario. Nada más.
- El trigger `handle_new_user` solo crea `profiles`. **No se crea ni `coaches` ni `coach_memberships`**: el middleware ve `get_my_roles()` = ninguno y manda a `/no-access` ("Si eres coach: escríbenos y activamos tu cuenta"). La activación es manual.
- `coaches` ya tiene `subscription_tier`, `billing_cycle`, `max_active_clients`, pero el código no los usa. No hay pasarela de pago ni prueba gratuita.
- `app/(coach)/layout.tsx` redirige a `/coach/ai-onboarding` mientras `coach_ai_profiles.profile_status != 'approved'` → hoy la IA es obligatoria.

**Invitación del atleta**
- `AddClientButton` (Miembros): nombre, email, teléfono, fecha, frecuencia, plantillas de revisión y onboarding (sin preselección), pago y contraseña inicial opcional.
- Sin contraseña, `sendInviteEmailSmtp` manda "Regístrate con este mismo email" con botón a `/login`. Pero no hay registro de atleta: `/signup` es el de coach con planes. Es el punto más frágil del flujo actual.
- La vinculación se hace en BD (`link_client_on_profile_insert`, por email) al crearse el perfil.
- El formulario de onboarding se envía aparte (`sendOnboardingAction`): crea un `checkin` pendiente y manda otro email con `/forms/<id>`. No guarda borradores; el esquema del formulario no tiene secciones.

**Atleta**
- Inicio en `/planning`. `PushNotificationBanner` y `StravaConnectorCard` ya existen pero sueltos. No hay pasos de bienvenida.
- La IA de entrenamiento usa `athlete_ai_profiles` (perfil generado), no las respuestas crudas del onboarding.

**Otros hallazgos**
- `.env.local` apunta a la **Supabase de producción** (no hay Supabase local ni staging, ni CLI de Supabase/Docker en este equipo). Cualquier prueba en el navegador lee y escribe en producción.
- Marca: la app dice "NexTrain" (manifest, 20 usos) y los emails "NextTrain" (5 usos). El plan dice "NextTrain".
- El PR #14 (`fix/client-notifications`) toca `mailer.ts`, `workspace/actions.ts`, `PlanTab.tsx`, `profile/page.tsx` y `notifications/client.ts`. Yo tendré que tocar `mailer.ts` (email de invitación) y `workspace/actions.ts` (Lucía en "Aprobar y enviar"). Cambios mínimos y rebase sobre main cuando se mergee el #14.

## Contraste con el plan

| Punto del plan | Qué falta en el código |
|---|---|
| 1. Espacio automático + "Tu espacio está listo" | Crear `coaches` + `coach_memberships(owner)` al entrar por primera vez con email confirmado y plan en los metadatos. Guardar disciplinas y nº de atletas (columnas nuevas → migración). |
| 2. Primeros pasos | Estado del checklist (ocultado, Lucía explorada) → migración. El resto se deduce de datos que ya existen. |
| 3. Lucía | Todo nuevo: datos de ejemplo, marca de ejemplo, exclusiones, borrado. |
| 4. Invitar | Formulario simplificado, plantillas por defecto (un coach nuevo no tiene ninguna), email nuevo con enlace de acceso real, seguimiento por atleta. |
| 5. Primer plan | Las 3 opciones ya existen en `PlanTab`; falta la entrada directa y pasar el onboarding a la IA. |
| 6. IA opcional | Quitar la redirección del layout y ofrecerla tras la primera aprobación. |
| Atleta 1–7 | Email, bienvenida, 4 pasos, secciones con tiempo y autoguardado del formulario, estado "plan en preparación". |

## Propuesta técnica (lo que decido yo salvo que digas otra cosa)

- **Alta**: lo hace la app, no un trigger en `auth`: la primera vez que entra un usuario con email confirmado, sin rol y con `subscription_tier` en los metadatos, va a `/welcome`, que crea el espacio con service role (idempotente). Los atletas no tienen esos metadatos, así que su flujo no cambia.
- **Plantillas por defecto** al crear el espacio: "Onboarding general" (con secciones) y "Revisión semanal". El formulario las trae preseleccionadas. A los coaches existentes se les preseleccionan las suyas por defecto.
- **Secciones del formulario**: nuevo tipo de campo `section` (solo título) dentro del JSON que ya existe, sin migración. El tiempo se estima por el número y el tipo de preguntas.
- **Invitación**: "Crear mi acceso" usa un enlace de Supabase `generateLink` (tipo invite, o magiclink si la cuenta ya existe) que lleva a `/auth/callback` → bienvenida con contraseña. "Reenviar" genera uno nuevo. El onboarding se crea como checkin pendiente al invitar y el atleta lo rellena dentro de la app (paso 4), sin un segundo email.
- **Progreso del atleta** (pasos vistos/omitidos) en `clients.preferences` (jsonb que ya existe). Para el seguimiento del coach: cuenta creada = `auth_user_id`, avisos = `push_subscriptions`, onboarding = checkin enviado.
- **Autoguardado**: borrador en `checkins.raw_payload` mientras siga pendiente.
- **Nombres**: "Álex" = nombre del coach (`profiles.full_name`); si falta, el nombre del negocio.

## Orden por fases (cada una con typecheck, tests de scripts/ y verificada en el navegador)

0. Migración aditiva (`supabase/migrations/`): columnas de onboarding del coach, `clients.is_sample` y función de borrado de la atleta de ejemplo.
1. **Coach — alta y panel**: `/welcome`, fuera la pantalla "sin acceso" para coaches, IA no obligatoria, tarjeta "Primeros pasos".
2. **Coach — Lucía**: creación, etiqueta y aviso, revisión ya analizada, "Aprobar y enviar" con vista previa, borrado.
3. **Coach — invitar**: plantillas por defecto, formulario corto, email nuevo, seguimiento con "Reenviar invitación".
4. **Coach — primer plan e IA**: entrada desde el checklist, la IA usa el onboarding, oferta de IA tras la primera aprobación.
5. **Atleta**: bienvenida, instalar app, avisos, Strava, formulario por secciones con autoguardado, "plan en preparación".

## Decisiones tomadas (16-10-2026)

- Propuestas 2 a 6 aprobadas tal cual (alta automática con límite del plan, Lucía, coaches existentes, contraseña inicial en "Más opciones").
- Marca: **NexTrain** en todo (también en los emails).
- Pruebas contra un Supabase de **staging**. El conector de Claude con Supabase no funciona: las tareas de BD van en `docs/onboarding-bd-staging.md` para que las ejecute otro modelo.

## Cambios del 01-11-2026: «cómo funciona» y foto de perfil

La bienvenida del atleta pasa a tener seis pasos: **cómo funciona la app** (las cinco pestañas), instalar la app, avisos, **foto de perfil**, reloj (Strava, opcional) y formulario del coach. Los dos nuevos se guardan en `clients.preferences.onboarding.tour` y `.photo`; la foto cuenta como hecha si el atleta ya tiene `profiles.avatar_url`.

Quien ya había terminado la bienvenida antes de este cambio no vuelve a ella (`finishedBeforeNewSteps` en `athlete-onboarding.js`); a esos atletas la foto se les pide con el aviso de novedades `profile-photo` (ver `docs/avisos-novedades.md`).
