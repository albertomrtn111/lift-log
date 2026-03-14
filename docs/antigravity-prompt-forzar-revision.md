# Prompt Antigravity — Forzar revisión desde tabla de miembros

## Contexto del proyecto
Stack: Next.js 14 App Router, TypeScript, Supabase, Tailwind, shadcn/ui, n8n.

## Tarea
Quiero añadir un botón "Enviar revisión" en el dropdown de acciones de cada cliente en `MembersTable`, exactamente igual al botón existente "Enviar onboarding". Este botón permite al coach forzar manualmente el envío de una revisión a un cliente concreto, independientemente de cuándo esté programada su próxima revisión.

**IMPORTANTE**: Este flujo NO debe actualizar `next_checkin_date` del cliente. La fecha programada de revisión debe respetarse. Si el coach fuerza una revisión hoy (jueves) pero el cliente tiene revisión programada para el sábado, el sábado debe seguir disparándose normalmente.

---

## Archivos a modificar/crear

### 1. `src/lib/n8n.ts`
Añadir la función `sendReviewEmail` al final del archivo, siguiendo el mismo patrón que `sendOnboardingEmail`.

El webhook URL debe leerlo de la env var `N8N_REVIEW_WEBHOOK_URL`, con fallback hardcodeado:
```
https://n8n.ascenttech.cloud/webhook/send-review
```

La función recibe los mismos parámetros que `sendOnboardingEmail`:
```ts
export async function sendReviewEmail(params: {
    clientId: string
    coachId: string
    clientEmail?: string
    clientName?: string
    checkinId?: string
    formTemplateId?: string
    formUrl?: string
}): Promise<N8nResult>
```

Y llama a `callN8n(N8N_REVIEW_URL, { client_id, coach_id, client_email, client_name, checkin_id, form_template_id, form_url })`.

---

### 2. `src/components/coach/review-actions.ts` (archivo NUEVO)
Crear este archivo nuevo copiando el patrón de `src/components/coach/onboarding-actions.ts` con estas diferencias:

- Se llama `sendReviewAction(clientId, coachId)`
- Busca plantilla con `type = 'checkin'` (no `'onboarding'`) y `is_default = true` y `is_active = true`
- Crea checkin con `type = 'checkin'` (no `'onboarding'`)
- Cancela checkins previos con `type = 'checkin'` y `status = 'pending'` antes de crear el nuevo
- Llama a `sendReviewEmail` (no `sendOnboardingEmail`) de `@/lib/n8n`
- **NO actualiza** `next_checkin_date` del cliente en ningún momento
- Retorna `{ success, checkin_id, form_url, error }` igual que el onboarding

El código completo:
```ts
'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendReviewEmail } from '@/lib/n8n'
import { revalidatePath } from 'next/cache'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface SendReviewResult {
    success: boolean
    checkin_id?: string
    form_url?: string
    error?: string
}

export async function sendReviewAction(
    clientId: string,
    coachId: string
): Promise<SendReviewResult> {
    // 1) Validate coach
    let supabase, validatedCoachId: string
    try {
        ; ({ supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId))
    } catch {
        return { success: false, error: 'No autorizado' }
    }

    // 2) Fetch client
    const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, email, full_name')
        .eq('id', clientId)
        .eq('coach_id', validatedCoachId)
        .single()

    if (clientErr || !client) return { success: false, error: 'Cliente no encontrado' }
    if (!client.email) return { success: false, error: 'El cliente no tiene email configurado' }

    // 3) Find default checkin template
    const { data: template, error: tplErr } = await supabase
        .from('form_templates')
        .select('id')
        .eq('coach_id', validatedCoachId)
        .eq('type', 'checkin')
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .single()

    if (tplErr || !template) {
        return {
            success: false,
            error: 'No tienes una plantilla default de revisión. Crea una en Formularios y márcala como default.',
        }
    }

    // 4) Cancel existing pending review checkins for this client
    await supabase
        .from('checkins')
        .update({ status: 'cancelled' })
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .eq('type', 'checkin')
        .eq('status', 'pending')

    // 5) Create fresh review checkin
    const { data: newCheckin, error: insertErr } = await supabase
        .from('checkins')
        .insert({
            coach_id: validatedCoachId,
            client_id: clientId,
            type: 'checkin',
            status: 'pending',
            form_template_id: template.id,
            source: 'coach_portal',
            raw_payload: {},
        })
        .select('id')
        .single()

    if (insertErr || !newCheckin) {
        console.error('[sendReviewAction] Insert error:', insertErr)
        return { success: false, error: insertErr?.message || 'Error al crear la revisión' }
    }

    const checkinId = newCheckin.id
    const formUrl = `${BASE_URL}/forms/${checkinId}`

    // 6) Call n8n webhook (non-blocking, just sends the email)
    const webhookResult = await sendReviewEmail({
        clientId: client.id,
        coachId: validatedCoachId,
        clientEmail: client.email,
        clientName: client.full_name ?? '',
        checkinId,
        formTemplateId: template.id,
        formUrl,
    })

    if (!webhookResult.ok) {
        console.warn('[sendReviewAction] n8n webhook failed (non-blocking):', webhookResult.error)
    }

    // NOTE: We intentionally do NOT update next_checkin_date here.
    // The scheduled review date must remain unchanged.

    revalidatePath('/coach/members')

    return {
        success: true,
        checkin_id: checkinId,
        form_url: formUrl,
    }
}
```

---

### 3. `src/components/coach/MembersTable.tsx`
Modificar el componente `ClientRow` para añadir el botón "Enviar revisión" justo debajo de "Enviar onboarding".

**Imports a añadir:**
```ts
import { sendReviewAction } from './review-actions'
import { RefreshCw } from 'lucide-react'
```

**Estado a añadir** (junto a `onboardingLinkModal`):
```ts
const [reviewLinkModal, setReviewLinkModal] = useState<{ url: string } | null>(null)
```

**Handler a añadir** (junto a `handleSendOnboarding`):
```ts
const handleSendReview = () => {
    startTransition(async () => {
        const result = await sendReviewAction(client.id, coachId)
        if (result.success && result.form_url) {
            toast({
                title: 'Revisión enviada ✓',
                description: `Revisión creada para ${client.full_name}`,
            })
            setReviewLinkModal({ url: result.form_url })
        } else {
            toast({
                title: 'Error al enviar revisión',
                description: result.error || 'Error desconocido',
                variant: 'destructive',
            })
        }
    })
}
```

**Botón a añadir en el DropdownMenu**, justo debajo del bloque de "Enviar onboarding" (después del cierre de `</TooltipProvider>` del onboarding):
```tsx
{/* Send Review */}
<TooltipProvider>
    <Tooltip>
        <TooltipTrigger asChild>
            <span>
                <DropdownMenuItem
                    onClick={handleSendReview}
                    disabled={isPendingSignup}
                    className={isPendingSignup ? 'opacity-50' : ''}
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Enviar revisión
                </DropdownMenuItem>
            </span>
        </TooltipTrigger>
        {isPendingSignup && (
            <TooltipContent side="left">
                <p className="text-xs">El cliente debe registrarse para recibir formularios</p>
            </TooltipContent>
        )}
    </Tooltip>
</TooltipProvider>
```

**Modal a añadir** (junto al modal de onboarding, justo después de su cierre `</Dialog>`):
```tsx
{/* Review Link Modal */}
<Dialog open={!!reviewLinkModal} onOpenChange={(v) => { if (!v) setReviewLinkModal(null) }}>
    <DialogContent className="sm:max-w-md">
        <DialogHeader>
            <DialogTitle>Revisión enviada</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Comparte este enlace con el cliente para que complete su revisión:
            </p>
            <div className="flex items-center gap-2">
                <Input
                    readOnly
                    value={reviewLinkModal?.url ?? ''}
                    className="text-xs font-mono"
                />
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={async () => {
                        if (!reviewLinkModal) return
                        try {
                            await navigator.clipboard.writeText(reviewLinkModal.url)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                        } catch {
                            toast({ title: 'Error al copiar', description: 'No se pudo copiar el enlace', variant: 'destructive' })
                        }
                    }}
                    className="shrink-0"
                >
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
            </div>
        </div>
        <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewLinkModal(null)}>Cerrar</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
```

---

## Instrucciones de env vars
En `.env.local` añadir:
```
N8N_REVIEW_WEBHOOK_URL=https://n8n.ascenttech.cloud/webhook/send-review
```

---

## Resumen de lo que NO hay que hacer
- ❌ No modificar `next_checkin_date` del cliente
- ❌ No tocar el workflow `enviar_reseñas` (el del cron de las 9am) — ese es independiente
- ❌ No reutilizar `onboarding-actions.ts` — crear archivo nuevo `review-actions.ts`
