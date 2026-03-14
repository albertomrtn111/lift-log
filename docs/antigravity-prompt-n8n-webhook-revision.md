# Prompt Antigravity — Workflow n8n: send-review (webhook)

## Contexto
Hay un workflow n8n en https://n8n.ascenttech.cloud/workflow/89mFZe55mpMtF7As que necesita configurarse para recibir llamadas desde la app Next.js cuando el coach fuerza manualmente el envío de una revisión.

Este workflow es DIFERENTE al workflow `enviar_reseñas` (el cron de las 9am). Este nuevo workflow se activa por webhook, no por horario.

## Qué debe hacer este workflow
Cuando la app hace POST al webhook con los datos del cliente y el checkin ya creado, el workflow solo debe:
1. Recibir los datos del webhook
2. Construir el email HTML
3. Enviar el email via Resend

**NO debe:**
- Consultar Supabase para buscar clientes (ya viene todo en el payload)
- Crear el checkin (ya fue creado en la app)
- Actualizar `next_checkin_date` (este flujo forzado no debe cambiar la fecha programada)

## Estructura del workflow (4 nodos en línea recta)

### Nodo 1: Webhook Trigger
- **Tipo:** Webhook
- **Método:** POST
- **Path:** `send-review`
- **URL resultante:** `https://n8n.ascenttech.cloud/webhook/send-review`
- **Authentication:** None (la app ya valida la sesión del coach antes de llamar)
- **Respond:** Immediately (responde 200 sin esperar)

### Nodo 2: BuildEmail (Set node)
- **Tipo:** Set (Manual Mapping)
- **Campos a definir:**

| Campo | Tipo | Valor |
|-------|------|-------|
| `to` | String | `{{$json.client_email}}` |
| `name` | String | `{{$json.client_name}}` |
| `checkin_id` | String | `{{$json.checkin_id}}` |
| `form_url` | String | `{{$json.form_url}}` |
| `subject` | String | `Revisión de NextTrain` |
| `html` | String | (ver abajo) |

**HTML del email:**
```html
<p>Hola <b>{{$json.client_name}}</b>,</p>
<p>Tu entrenador ha preparado tu revisión en NextTrain.</p>
<p>Pulsa aquí para completarla:</p>
<p><a href="{{$json.form_url}}">Abrir revisión</a></p>
<p>Si el botón no funciona, copia este enlace en tu navegador:</p>
<p>{{$json.form_url}}</p>
```

En el nodo Set, el campo `html` debe construirse concatenando o usando una expresión. La forma más simple es poner el HTML directamente con las expresiones inline de n8n:
```
<p>Hola <b>{{$json.client_name}}</b>,</p> <p>Tu entrenador ha preparado tu revisión en NextTrain.</p> <p>Pulsa aquí para completarla:</p> <p><a href="{{$json.form_url}}">Abrir revisión</a></p> <p>Si el botón no funciona, copia este enlace: {{$json.form_url}}</p>
```

### Nodo 3: SendEmail (HTTP Request)
- **Tipo:** HTTP Request
- **Método:** POST
- **URL:** `https://api.resend.com/emails`
- **Authentication:** Generic Credential Type → Header Auth → (usar la misma credencial "Header Auth account" que usan los otros workflows)
- **Send Headers:** OFF (la auth ya va incluida)
- **Send Body:** ON
- **Body Content Type:** JSON
- **Specify Body:** Using JSON
- **JSON body:**
```json
{
  "from": "NextTrain <no-reply@ascenttech.cloud>",
  "to": "{{$node['BuildEmail'].json.to}}",
  "subject": "{{$node['BuildEmail'].json.subject}}",
  "html": "{{$node['BuildEmail'].json.html}}"
}
```

## Notas importantes
- El payload que llega del webhook tiene estos campos: `client_id`, `coach_id`, `client_email`, `client_name`, `checkin_id`, `form_template_id`, `form_url`
- Toda la lógica (crear checkin, cancelar previos, etc.) ya fue ejecutada en la app Next.js antes de llamar al webhook
- Este workflow es solo el "enviador de email" — sin lógica de negocio
- Publicar el workflow cuando esté listo
