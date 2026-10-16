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

Y pasar al dueño cualquier error o advertencia que salga al aplicar la migración.
