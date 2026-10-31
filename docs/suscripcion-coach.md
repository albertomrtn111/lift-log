# Suscripción del coach: prueba gratis y cobro con Stripe

Decisiones del dueño (31-10-2026):

- **Prueba gratis de 30 días, sin tarjeta, siempre con Pro** (75 atletas), elija el plan que elija al registrarse.
- **Al terminar sin pagar, el coach queda bloqueado**: solo ve «Suscripción». No se borra nada y sus atletas siguen usando su app.
- **Stripe Billing**: Checkout para suscribirse y Customer Portal para tarjeta, facturas, datos fiscales, cambio de plan y cancelación.
- **Precios sin IVA** (29/79/199 € al mes, 290/790/1990 € al año + IVA).
- **Se aplica el límite de atletas activos del plan** (20/75/250; Concierge sin límite). La atleta de ejemplo no cuenta.

## Cómo funciona

1. `/signup` → `/signup/details` → verificación del email → `/welcome` llama a `create_coach_workspace`, que crea el espacio con `subscription_tier = 'pro'` y una fila en `coach_subscriptions` con `status = 'trialing'`, `trial_ends_at = ahora + 30 días` y `plan` = el elegido en el registro (el que se le propondrá al pagar). La prueba vive en la app; Stripe no se entera hasta que el coach paga.
2. Durante la prueba se ve un aviso con los días que quedan y el menú «Suscripción» (`/coach/subscription`).
3. Si elige plan antes de que acabe la prueba, Checkout crea la suscripción con `trial_end` = fin de la prueba: guarda la tarjeta y **no cobra hasta ese día** (si quedan menos de 48 h, mínimo de Stripe, cobra al momento). Mientras dure la prueba sigue con Pro; al empezar a pagar pasa al plan pagado.
4. Stripe avisa por webhook (`/api/stripe/webhook`) y la app copia el estado en `coach_subscriptions` (siempre relee la suscripción en Stripe, así el orden de los eventos da igual). Al volver de Checkout la página también sincroniza, sin esperar al webhook.
5. Acceso (`src/lib/subscription/access.js`): `comped`, `active`, `past_due` y la prueba en curso dan acceso; el resto (prueba terminada, `canceled`, `unpaid`, `paused`, `incomplete*`) no. `past_due` mantiene el acceso mientras Stripe reintenta el cobro.

### Dónde se aplica el bloqueo

- `middleware.ts`: cualquier `/coach/*` salvo `/coach/subscription` redirige a Suscripción.
- `requireActiveCoachId`: las acciones de servidor del coach fallan con «Tu prueba gratis ha terminado…».
- MCP (`resolveCoach` en `supabase/functions/nexttrain-mcp/shared.ts`): las herramientas devuelven el mismo aviso.
- Las rutas `/api/*` que no usan `requireActiveCoachId` no comprueban la suscripción.

### Límite de atletas

Lo aplica el trigger `trg_enforce_coach_client_limit` en `clients` (altas, reactivaciones, MCP…), con `hint = 'athlete_limit'`. La app muestra «Has llegado al límite de N atletas activos de tu plan. Puedes cambiar de plan en Suscripción.». Al bajar de plan no se da de baja a nadie: solo se impide activar más. Checkout no deja elegir un plan más pequeño que los atletas activos.

### Plan protegido

`subscription_tier`, `billing_cycle` y `max_active_clients` de `coaches` ya no los puede cambiar un coach desde la API (trigger `trg_protect_coach_plan_columns`); solo el servidor (service role).

### Espacios anteriores

La migración da de alta todos los espacios existentes como `comped` (acceso sin coste, sin prueba). Para regalar acceso a otro espacio:

```sql
update coach_subscriptions set status = 'comped', updated_at = now() where coach_id = '<coach_id>';
```

## Configurar Stripe

Stripe deja usar el **modo test sin dar de alta la empresa**: basta con crear la cuenta con un email. Los datos de la empresa solo hacen falta para activar el modo real (live).

1. Crear la cuenta de Stripe (la crea el dueño) y copiar la clave secreta de test (`sk_test_…`).
2. `STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-setup.mjs`: crea los productos, los 6 precios (`lookup_key` `nextrain_<plan>_<monthly|yearly>`, IVA aparte), el IVA 21 % y el Customer Portal. Es idempotente. Para live: la clave `sk_live_…` y `--live`.
3. Variables (en `.env.local` y en el `.env` del servidor):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`: del endpoint `https://nexttrain.ascenttech.cloud/api/stripe/webhook` (eventos `checkout.session.completed` y `customer.subscription.created/updated/deleted/paused/resumed`), o de `stripe listen` en local.
   - `STRIPE_TAX_RATE_ID`: el IVA 21 % que imprime el script. O bien `STRIPE_AUTOMATIC_TAX=true` para usar Stripe Tax (calcula el IVA por país y la inversión del sujeto pasivo entre empresas de la UE; requiere configurarlo en Stripe y cuesta un 0,5 % por transacción). Con el Tax Rate fijo se aplica siempre el 21 %.
4. Sin `STRIPE_SECRET_KEY` la prueba gratis funciona igual; la pantalla de Suscripción dice que el pago online llegará pronto y remite a ventas@.

## Probar en modo test

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook   # imprime el whsec_ para STRIPE_WEBHOOK_SECRET
```

Con un coach de prueba del dueño (ver `docs/entorno-de-pruebas.md`):

1. Registrarse → `/welcome` → el aviso dice «quedan 30 días» y Atletas «0 de 75».
2. Suscripción → «Elegir Starter» → Checkout con la tarjeta `4242 4242 4242 4242`: vuelve con «¡Gracias!», el estado es «Prueba gratis… has elegido Starter» y en Stripe la suscripción está en `trialing` hasta el fin de la prueba.
3. «Gestionar suscripción» abre el Portal: cambiar a Pro, ver facturas, cancelar.
4. Fin de la prueba: en el dashboard de Stripe, terminar la prueba de esa suscripción (o adelantar el tiempo con un Test Clock). Debe pasar a `active` y el espacio a Starter (20 atletas).
5. Prueba terminada sin pagar: con otro coach de prueba, poner `trial_ends_at` en el pasado (`update coach_subscriptions set trial_ends_at = now() - interval '1 minute' where coach_id = …`). El panel redirige a Suscripción y el MCP devuelve el aviso.
6. Pago fallido: tarjeta `4000 0000 0000 0341` → `past_due` (sigue entrando, aviso de tarjeta).
7. Límite: con Starter, el atleta 21 da el error del límite.
8. Limpiar el coach de prueba con el bloque de `docs/entorno-de-pruebas.md` (la fila de `coach_subscriptions` se borra en cascada con `coaches`) y cancelar sus suscripciones de test en Stripe.

## Desplegar

1. Migración `20261101100000_coach_subscriptions.sql` en Supabase (con permiso del dueño). **Antes** que la web: el código nuevo sin la tabla bloquearía las acciones de todos los coaches.
2. MCP: `scripts/deploy-mcp.sh`.
3. Variables de Stripe en el `.env` del servidor (si ya hay cuenta) y web: `scripts/deploy-web.sh`.
4. Web comercial (`nextrain-web`): anunciar la prueba gratis de 30 días y «+ IVA» en precios y FAQ.

## Pendiente / ideas

- Emails de aviso antes de que acabe la prueba (hoy solo el aviso dentro de la app).
- Las rutas `/api/*` del coach no miran la suscripción.
