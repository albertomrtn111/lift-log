# Entorno de pruebas (léelo antes de un cambio grande)

Estado a 16-10-2026. Si eres otro chat: **hoy no existe un staging**. El `.env.local` de la app apunta a la base de datos de **producción** (Supabase `SaaS Asesorias`, ref `kqwstdbdocbynvijnpka`, organización Ascenttech, plan gratuito). Cualquier prueba en el navegador con ese `.env` lee y escribe datos reales y puede enviar emails reales.

## Por qué no hay staging

- Supabase gratuito permite **2 proyectos activos por usuario** (sumando todas sus organizaciones). El dueño ya tiene 2 (`SaaS Asesorias` y otro en otra organización), así que crear `SaaS Asesorias - staging` falla con «2 project limit».
- Las ramas de base de datos de Supabase (branching) requieren plan de pago.
- No hay Docker ni Supabase CLI instalados en el Mac, así que tampoco hay Supabase local.
- Decisión del dueño: **esperar a pasar a Supabase Pro**. Hasta entonces, los cambios grandes se prueban en producción con cuentas de prueba y se limpian después (ver abajo).

## Opciones cuando haga falta un staging de verdad

1. **Supabase Pro** (~25 $/mes en Ascenttech): permite más proyectos y ramas de base de datos para cada cambio grande. Es la opción prevista.
2. **Pausar el otro proyecto gratuito** del dueño: libera el hueco y el staging sale gratis.
3. **Supabase local** (`supabase start`): base de datos, Auth, API, Storage y Mailpit (los emails se quedan en un buzón local). Necesita Colima + Docker CLI + Supabase CLI (Homebrew) y unos 3–4 GB de imágenes; el Mac tiene 8 GB de RAM y ~11 GB libres, así que va justo. Pedir permiso antes de instalar nada.

Para cualquier staging, la estructura **no** sale de `supabase/migrations/`: la base se creó a mano antes de la primera migración. Hay que copiarla del catálogo de producción sin datos: tablas, funciones, triggers (incluidos `on_auth_user_created` en `auth.users` → `handle_new_auth_user()` y `trg_link_client_on_profile_insert` en `profiles`), RLS, buckets (`checkin-media`, `avatars`, `chat-media`) y sus políticas. **No** copiar los cron de producción (`review-scheduler-*`, `coach-reminders-15min`), que llaman a servicios reales. Detalle en `docs/onboarding-bd-staging-resultado.md`, si está en tu copia.

## Reglas mientras no haya staging

- No aplicar migraciones a producción sin permiso explícito del dueño.
- Leer metadatos del esquema (catálogo, definiciones) está bien; no leer datos de usuarios sin permiso.
- Probar en producción solo con **cuentas de prueba del dueño** (emails suyos o alias `+prueba`). Las crea él, no un chat.
- Al terminar, limpiar todo lo de prueba con el bloque de abajo.

## Probar un flujo en producción y limpiarlo

1. El dueño se registra como coach con un email de prueba (por ejemplo `tuemail+coach-prueba@…`) e invita a un atleta con otro alias suyo.
2. Al terminar, en el SQL Editor de Supabase (como `postgres`), localizar el espacio:

```sql
select c.id as coach_id, c.name, p.email
from coaches c
join coach_memberships m on m.coach_id = c.id and m.role = 'owner'
join profiles p on p.id = m.user_id
where lower(p.email) = lower('<email del coach de prueba>');
```

3. Borrar el espacio de prueba entero (todo en una transacción; revisar el `coach_id` dos veces):

```sql
begin;

-- Atletas del espacio, incluida Lucía: se marcan como "de ejemplo" para reutilizar
-- delete_sample_client, que borra todo lo que cuelga de cada atleta
update clients set is_sample = true where coach_id = '<coach_id>';
select public.delete_sample_client('<coach_id>', id) from clients where coach_id = '<coach_id>';

-- Lo que cuelga del espacio
delete from review_template_metrics where review_template_id in (select id from review_templates where coach_id = '<coach_id>');
delete from review_templates where coach_id = '<coach_id>';
delete from form_templates where coach_id = '<coach_id>';
delete from metric_definitions where coach_id = '<coach_id>';
delete from diet_template_items where template_option_id in (
  select o.id from diet_template_options o join diet_template_meals m on m.id = o.template_meal_id
  join diet_templates t on t.id = m.template_id where t.coach_id = '<coach_id>');
delete from diet_template_options where template_meal_id in (
  select m.id from diet_template_meals m join diet_templates t on t.id = m.template_id where t.coach_id = '<coach_id>');
delete from diet_template_meals where template_id in (select id from diet_templates where coach_id = '<coach_id>');
delete from diet_templates where coach_id = '<coach_id>';
delete from training_templates where coach_id = '<coach_id>';
delete from coach_tasks where coach_id = '<coach_id>';
delete from coach_ai_profiles where coach_id = '<coach_id>';
delete from coach_email_settings where coach_id = '<coach_id>';
delete from coach_notification_preferences where coach_id = '<coach_id>';
delete from coach_push_subscriptions where coach_id = '<coach_id>';
delete from coach_reminder_log where coach_id = '<coach_id>';
delete from coach_assistant_messages where coach_id = '<coach_id>';
delete from coach_memberships where coach_id = '<coach_id>';
delete from coaches where id = '<coach_id>';

commit;
```

Si algún `delete` falla por una clave foránea nueva, hacer `rollback`, añadir esa tabla antes y repetir.

4. Borrar los usuarios de prueba (coach y atletas) en **Authentication → Users**.

## Historial

- 16-10-2026 — Onboarding guiado (PR #19, arreglo en #23): no se pudo probar en staging por el límite de proyectos. Las migraciones `20261016090000_guided_onboarding` y `20261016100000_delete_sample_client` ya están aplicadas en producción (las aplicó alguien fuera de la sesión de Claude que hizo el código; coinciden con las del repo). Pendiente: prueba del dueño en producción y limpieza con el bloque de arriba.
