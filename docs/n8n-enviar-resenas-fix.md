# Fix workflow n8n: enviar_reseñas

## Contexto
Workflow en n8n: `enviar_reseñas` (https://n8n.ascenttech.cloud)
Propósito: Cada día a las 9am, detectar clientes con revisión pendiente y enviarles un email con enlace al formulario.

## Flujo actual (con bugs)
```
Schedule Trigger → SetToday → GetDueClients → GetFormTemplate
→ GetExistingPendingCheckin (BUG) → CrearCheckin → BuildEmail → SendEmail1
```

## Diagnóstico de bugs

### Bug 1 — Nodo "Obtener registro pendiente existente" tiene URL incorrecta
**Nodo:** `GetExistingPendingCheckin`
**Problema:** Tiene exactamente la misma URL que `GetFormTemplate`:
```
form_templates?coach_id=eq.{{$json.coach_id}}&type=eq.checkin&is_default=eq.true&select=id,title
```
No hace lo que su nombre dice. Debería consultar checkins pendientes, pero duplica la consulta de plantillas. Es un nodo inútil que confunde el flujo.
**Fix:** Eliminar este nodo. El flujo debe ir directamente de `GetFormTemplate` → `CrearCheckin`.

### Bug 2 — No se cancelan checkins previos antes de crear uno nuevo
**Nodo:** No existe este paso
**Problema:** Si el workflow corre varias veces (o hubo error previo), se acumulan checkins `pending` para el mismo cliente. El cliente recibiría múltiples links activos.
**Fix:** Añadir un nodo HTTP PATCH **antes** de `CrearCheckin` que cancele los checkins previos:
```
PATCH https://[supabase-url]/rest/v1/checkins?client_id=eq.{{$node["GetDueClients"].json.id}}&coach_id=eq.{{$node["GetDueClients"].json.coach_id}}&type=eq.checkin&status=eq.pending
Body: {"status": "cancelled"}
Headers: apikey, Authorization, Content-Type: application/json, Prefer: return=minimal
```

### Bug 3 — No se actualiza next_checkin_date después de enviar
**Nodo:** No existe este paso
**Problema:** Después de crear el checkin y enviar el email, `clients.next_checkin_date` no se actualiza. El próximo día la misma fecha sigue en la BD y el workflow puede volver a dispararse para el mismo cliente.
**Fix:** Añadir un nodo HTTP PATCH **después** de `SendEmail1` que actualice la fecha del próximo checkin:
```
PATCH https://[supabase-url]/rest/v1/clients?id=eq.{{$node["GetDueClients"].json.id}}
Body: {
  "next_checkin_date": "{{$now.plus({days: $node['GetDueClients'].json.checkin_frequency_days}).toFormat('yyyy-LL-dd')}}"
}
Headers: apikey, Authorization, Content-Type: application/json, Prefer: return=minimal
```
**Nota:** Para esto necesitas que `GetDueClients` también seleccione `checkin_frequency_days`:
```
clients?status=eq.active&next_checkin_date=eq.{{$json.today}}&select=id,full_name,email,coach_id,next_checkin_date,checkin_frequency_days
```

### Bug 4 — form_url hardcodeada en BuildEmail
**Nodo:** `BuildEmail`
**Campo:** `form_url`
**Valor actual:**
```
{{'https://nexttrain.ascenttech.cloud/forms/' + $node["CreateCheckin"].json[0].id}}
```
**Problema:** El dominio está hardcodeado. Si la app cambia de dominio hay que acordarse de cambiar esto.
**Fix:** Si `nexttrain.ascenttech.cloud` es el dominio definitivo de producción, está bien. Solo verificar que coincida con el dominio real de la app.

## Flujo correcto después del fix
```
Schedule Trigger
→ SetToday
→ GetDueClients (añadir checkin_frequency_days al select)
→ GetFormTemplate
→ CancelPendingCheckins (NUEVO: PATCH status=cancelled)
→ CrearCheckin (sin cambios)
→ BuildEmail (sin cambios)
→ SendEmail1 (sin cambios)
→ UpdateNextCheckinDate (NUEVO: PATCH next_checkin_date)
```

## Cambios en GetDueClients
Actualizar URL para incluir `checkin_frequency_days`:
```
https://[supabase-url]/rest/v1/clients?status=eq.active&next_checkin_date=eq.{{$json.today}}&select=id,full_name,email,coach_id,next_checkin_date,checkin_frequency_days
```

## Resumen de cambios
| Acción | Nodo | Descripción |
|--------|------|-------------|
| 🗑️ Eliminar | GetExistingPendingCheckin | Nodo inútil con URL incorrecta |
| ✏️ Modificar | GetDueClients | Añadir `checkin_frequency_days` al select |
| ➕ Añadir | CancelPendingCheckins | PATCH antes de crear, cancela checkins previos |
| ➕ Añadir | UpdateNextCheckinDate | PATCH después de enviar, actualiza fecha próxima revisión |
