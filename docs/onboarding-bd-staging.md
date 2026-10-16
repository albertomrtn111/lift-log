# Tareas de base de datos para el onboarding guiado (solo STAGING)

Instrucciones para quien tenga acceso a Supabase. **No aplicar nada en producción** (proyecto `kqws…`) sin permiso explícito del dueño.

## 1. Preparar el proyecto de staging (una sola vez)

Las migraciones del repo no reconstruyen el esquema completo: hay que copiar el de producción **sin datos**.

1. Volcar solo el esquema de producción (`public`, más los triggers de `auth.users` que usa la app):
   `supabase db dump --db-url "<prod>" --schema public -f schema.sql` (o `pg_dump --schema-only --no-owner --no-privileges`).
   Incluye las funciones `get_my_roles`, `activate_client_for_coach`, `handle_new_user`, `link_client_on_profile_insert`, los tipos `subscription_tier`/`billing_cycle`, las políticas RLS y los buckets de storage que use la app.
2. Cargarlo en staging y comprobar que existe el trigger `on_auth_user_created` sobre `auth.users`.
3. En staging, en Authentication → URL Configuration:
   - Site URL: `http://localhost:3107`
   - Redirect URLs: `http://localhost:3107/auth/callback`, `http://localhost:3107/**`
   - Confirmación de email activada (igual que en producción).
4. Pasar al dueño las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` de staging, para un `.env.local` del worktree `lift-log-onboarding`.

## 2. Aplicar la migración de la fase 0/1

Fichero: `supabase/migrations/20261016090000_guided_onboarding.sql` (rama `feature/guided-onboarding`). Es aditiva:

- `coaches`: `disciplines text[]`, `expected_athletes text`, `onboarding_state jsonb` (con checks).
- `clients`: `is_sample boolean default false` + índice parcial.
- Función `create_coach_workspace(uuid, text, text, text, integer)`, `SECURITY DEFINER`, ejecutable **solo** por `service_role`.

## 3. Comprobaciones tras aplicarla

```sql
-- Columnas nuevas
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'coaches' and column_name in ('disciplines', 'expected_athletes', 'onboarding_state'))
    or (table_name = 'clients' and column_name = 'is_sample'));

-- La función no la puede ejecutar authenticated ni anon (debe dar false, false, true)
select has_function_privilege('authenticated', 'public.create_coach_workspace(uuid, text, text, text, integer)', 'execute'),
       has_function_privilege('anon', 'public.create_coach_workspace(uuid, text, text, text, integer)', 'execute'),
       has_function_privilege('service_role', 'public.create_coach_workspace(uuid, text, text, text, integer)', 'execute');
```

## 4. Migración de la fase 2 (atleta de ejemplo)

Fichero: `supabase/migrations/20261016100000_delete_sample_client.sql`. Crea `delete_sample_client(uuid, uuid)`: borra en una transacción a la atleta de ejemplo (solo si `is_sample = true` y es del coach indicado) con todo lo que cuelga de ella. Ejecutable **solo** por `service_role`.

Comprobaciones:

```sql
select has_function_privilege('authenticated', 'public.delete_sample_client(uuid, uuid)', 'execute'),  -- false
       has_function_privilege('service_role', 'public.delete_sample_client(uuid, uuid)', 'execute');   -- true

-- Con un atleta NO de ejemplo debe fallar con 'Solo se puede borrar la atleta de ejemplo de tu espacio'
-- (con un coach y un cliente de prueba creados en staging, nunca en producción; dentro de begin/rollback)
begin;
select public.delete_sample_client('<coach_id>', '<client_id_real>');
rollback;
```

Si hay triggers en `clients`, `checkins`, `reviews` o `messages` que no estén en el repo (webhooks, envíos de email o push), avisar: Lucía inserta filas en esas tablas y no debe disparar nada hacia fuera.

## 5. Fase 3 (invitación del atleta): Auth y vinculación

Sin migración nueva. Comprobar en staging, y **contarle al dueño** cómo está en producción, sin cambiarlo:

1. **Caducidad del enlace**: Authentication → Providers → Email → "Email OTP Expiration". La invitación usa enlaces generados con `auth.admin.generateLink` (tipo `invite` o `magiclink`), que caducan con ese valor (por defecto 3600 s). Recomendado: 86400 (24 h, el máximo).
2. **Redirect URLs**: deben admitir `<APP_URL>/auth/callback?next=...` (con `http://localhost:3107/**` en staging basta).
3. **Trigger de vinculación**: pegar la definición de `public.link_client_on_profile_insert()` y del trigger que la llama (`select pg_get_functiondef('public.link_client_on_profile_insert'::regproc);` y `select tgname, tgrelid::regclass from pg_trigger where tgfoid = 'public.link_client_on_profile_insert'::regproc;`). Necesito saber qué columnas de `clients` rellena (`user_id`, `auth_user_id`, `status`…) cuando se crea el perfil del atleta.
4. Confirmar que `client_review_schedules` tiene la restricción única `(client_id, review_template_id)` (la invitación hace `upsert` sobre ella).

## 6. Fase 4 (primer plan e IA)

Sin cambios de base de datos.

## 7. Fase 5 (bienvenida del atleta)

Sin migración. Usa columnas que ya existen: `clients.preferences` (jsonb; el progreso va en `preferences.onboarding`) y `checkins.raw_payload` (el borrador autoguardado va en `raw_payload._draft` mientras el formulario está pendiente). Comprobar:

1. Que nada en la BD (triggers, vistas, funciones) dependa de que `raw_payload` de un checkin pendiente esté vacío.
2. Que `clients.preferences` no lo use ningún proceso externo (n8n, MCP…) con otro formato.
3. Redirect URLs: el enlace de invitación vuelve a `<APP_URL>/auth/callback?next=%2Fbienvenida`.

## 8. Al terminar

Pasar al dueño cualquier error o advertencia que salga al aplicar las migraciones.
