# Correos de acceso (Supabase Auth)

Estado a 22-11-2026 (NXT-135). Los correos de cuenta (confirmar el registro del coach, recuperar la contraseña, enlace mágico, invitación desde el panel y cambio de email) los manda **Supabase Auth**, no la app. Este documento explica cómo están hechos y qué hay que configurar en el panel de Supabase.

Las invitaciones de atletas y de equipo **no** pasan por aquí: la app genera el enlace con `admin.generateLink` (`src/lib/onboarding/athlete-invite.ts`) y lo manda con su propio SMTP (`src/lib/email/mailer.ts`, variables `SMTP_*`). No dependen de estas plantillas.

## Cómo funcionan los enlaces

Las plantillas de `supabase/templates/` **no** usan `{{ .ConfirmationURL }}`. Llevan a una ruta propia:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<tipo>&next=<pantalla>
```

`app/auth/confirm/page.tsx` muestra un botón y, al pulsarlo, valida el enlace con `supabase.auth.verifyOtp({ token_hash, type })`, crea la sesión y lleva a `next`.

- **Funciona en cualquier dispositivo.** `{{ .ConfirmationURL }}` con el flujo PKCE solo funciona en el navegador que pidió el enlace; abierto en el navegador de Gmail o en otro móvil fallaba.
- **Los antivirus del correo no gastan el enlace.** Outlook y Microsoft Defender abren los enlaces antes que la persona; como el enlace se valida al pulsar el botón, esa visita no lo consume.
- La tabla de tipos y destinos está en `src/lib/auth/email-links.ts` (`EMAIL_TEMPLATE_LINKS`). `scripts/email-links.test.mjs` comprueba que cada plantilla la cumple.

Además, el registro del coach y su reenvío usan `createEmailLinkClient()` (flujo implícito, como recuperar la contraseña). Así, aunque alguna plantilla siga siendo la de Supabase, su `{{ .ConfirmationURL }}` vuelve a `/auth/callback#access_token=…` y también funciona en otro dispositivo.

## Plantillas

En Supabase › Authentication › Emails › **Templates**, para cada una: pegar el **asunto** y el contenido entero del fichero en el cuerpo (pestaña «Source»).

| Plantilla en el panel | Asunto | Fichero | Enlace |
| --- | --- | --- | --- |
| Confirm signup | Confirma tu email para empezar en NexTrain | `supabase/templates/confirm-signup.html` | `type=email` → `/` (la raíz lleva al coach nuevo a `/welcome`) |
| Invite user | Te han invitado a entrenar en NexTrain | `supabase/templates/invite-user.html` | `type=invite` → `/bienvenida` |
| Magic Link | Tu enlace para entrar en NexTrain | `supabase/templates/magic-link.html` | `type=email` → `/` |
| Change Email Address | Confirma el cambio de email de tu cuenta de NexTrain | `supabase/templates/change-email.html` | `type=email_change` → `/` |
| Reset Password | Crea tu contraseña nueva de NexTrain | `supabase/templates/reset-password.html` | `type=recovery` → `/set-password?mode=reset` |
| Reauthentication | Tu código de verificación de NexTrain | `supabase/templates/reauthentication.html` | Sin enlace: solo el código `{{ .Token }}` |

Notas:

- Hoy la app no usa el enlace mágico, el cambio de email ni la reautenticación. Las plantillas están para que, si Supabase llega a mandarlos, salgan en español y con un enlace que funcione.
- Los textos dicen que el enlace caduca **en una hora** (lo mismo que dice `/forgot-password`). Si se cambia «Email OTP Expiration», hay que cambiar también esos textos.
- Si el panel muestra además las plantillas de «Security notifications» (contraseña cambiada, email cambiado…), se pueden dejar desactivadas.

## Pasos en el panel de Supabase (en orden)

Proyecto `SaaS Asesorias` (`kqwstdbdocbynvijnpka`). Ninguna clave va en el repositorio.

0. **Antes, en Resend:** el dominio `ascenttech.cloud` tiene que estar verificado (Domains). Si no lo está, Resend da unos registros DNS (MX y TXT de `send.ascenttech.cloud` y el TXT `resend._domainkey`). Se **añaden** en Cloudflare sin tocar los que ya hay. Crear una API key con permiso «Sending access».
1. **Authentication › Emails › SMTP Settings** → activar «Enable Custom SMTP»:
   - Sender email: `no-reply@ascenttech.cloud`
   - Sender name: `NexTrain`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: la API key de Resend
   - Minimum interval between emails being sent: `60` segundos (la pantalla de reenviar de la app espera lo mismo).
   - Guardar.
2. **Authentication › Rate Limits** → «Rate limit for sending emails»: subirlo a `100` por hora (con SMTP propio Supabase arranca en 30). El plan gratuito de Resend permite 100 al día y 3.000 al mes; si se pasa de eso, subir de plan en Resend antes que aquí.
3. **Authentication › Sign In / Providers › Email**: comprobar que «Confirm email» está activado y que «Email OTP Expiration» es `3600` (una hora).
4. **Authentication › URL Configuration**:
   - Site URL: `https://nexttrain.ascenttech.cloud` (sin barra al final). Las plantillas montan el enlace con `{{ .SiteURL }}`.
   - Redirect URLs: que estén `https://nexttrain.ascenttech.cloud/**` (cubre `/auth/callback?next=…` y `/auth/confirm`). Para pruebas en local, `http://localhost:3000/**`. No borrar las que ya haya.
5. **Desplegar la web** con este cambio (`scripts/deploy-web.sh check` y `scripts/deploy-web.sh`). Las plantillas enlazan a `/auth/confirm`, que no existe hasta entonces: **no pegar las plantillas antes de desplegar**.
6. **Authentication › Emails › Templates**: pegar asunto y fichero de cada plantilla de la tabla de arriba y guardar cada una.
7. Probar de punta a punta (abajo).

Los pasos 1 a 4 se pueden hacer antes de desplegar: con el código actual siguen funcionando las plantillas de Supabase.

## Cómo probarlo de punta a punta

Con cuentas de prueba del dueño (alias `+prueba`) y limpiándolas después según `docs/entorno-de-pruebas.md`.

1. **Registro de coach en Gmail, abierto en otro dispositivo.** En el ordenador, `/signup` → plan → «Crear cuenta» con `tuemail+coach-prueba@gmail.com`. En el móvil, abrir el correo en la app de Gmail (navegador de Gmail) → «Confirmar mi email» → «Confirmar y entrar» → debe llegar a «Crea tu espacio» (`/welcome`).
2. **Reenviar.** Registrar otra cuenta y, en la pantalla «Confirma tu email», pulsar «Reenviar el email de confirmación»: llega un segundo correo y el botón espera un minuto. El enlace del primer correo deja de valer; el del último, sí.
3. **Login sin confirmar.** Con esa cuenta sin confirmar, en `/login` escribir email y contraseña: sale «Falta confirmar tu email» y el botón de reenviar.
4. **Outlook / Hotmail.** Registrar un coach con una dirección de Outlook. Abrir el correo desde Outlook (web o app): el enlace no debe aparecer como «ya usado» aunque Outlook lo haya revisado antes. Mirar que no llega a correo no deseado y que el remitente es «NexTrain <no-reply@ascenttech.cloud>».
5. **Recuperar la contraseña.** `/forgot-password` con una cuenta de prueba, abrir el correo en otro dispositivo → «Crear contraseña nueva» → `/set-password?mode=reset` → guardar → entra.
6. **Invitación de un atleta** (la manda la app, no Supabase): invitar a un alias de prueba y comprobar que sigue llegando a `/bienvenida`. La ficha del atleta se enlaza con su cuenta al confirmar el email (disparador `on_auth_user_email_confirmed`).
7. En Resend › Emails, comprobar que salen los correos y que no hay rebotes.

Si algo falla: en Supabase › Logs › Auth aparecen los errores de envío (SMTP) y de `verify`.
