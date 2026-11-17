'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

// La autorización solo se puede responder una vez. Un doble clic mandaba dos
// respuestas: la primera conectaba, la segunda fallaba y el navegador enseñaba
// ese error en lugar de volver al asistente, que se quedaba sin conectar.
export function ConsentActions({ authorizationId }: { authorizationId: string }) {
    const sent = useRef(false)
    const [decision, setDecision] = useState<'approve' | 'deny' | null>(null)

    return (
        <form
            action="/api/oauth/decision"
            method="POST"
            className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end"
            onSubmit={(event) => {
                if (sent.current) {
                    event.preventDefault()
                    return
                }
                sent.current = true
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
                const value = submitter?.value === 'deny' ? 'deny' : 'approve'
                // Se marca después de enviar para que el botón pulsado viaje en el formulario.
                setTimeout(() => setDecision(value), 0)
            }}
        >
            <input type="hidden" name="authorization_id" value={authorizationId} />
            <Button type="submit" name="decision" value="deny" variant="outline" className="h-11 w-full sm:w-auto" disabled={decision !== null}>
                Cancelar
            </Button>
            <Button type="submit" name="decision" value="approve" className="h-11 w-full sm:w-auto" disabled={decision !== null}>
                {decision === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {decision === 'approve' ? 'Conectando…' : 'Autorizar conexión'}
            </Button>
        </form>
    )
}
