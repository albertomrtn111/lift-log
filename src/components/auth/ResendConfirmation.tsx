'use client'

import { useEffect, useState } from 'react'
import { Loader2, RotateCw } from 'lucide-react'
import { createEmailLinkClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthAlert } from '@/components/auth/AuthFields'
import { authErrorMessage, classifyAuthError } from '@/lib/auth/auth-errors'
import {
    formatWait,
    lastSentForRetryAfter,
    resendStorageKey,
    retryAfterFromMessage,
    secondsUntilResend,
    signupRedirectUrl,
} from '@/lib/auth/email-links'
import { cn } from '@/lib/utils'

function readLastSent(email: string): number | null {
    try {
        return Number(window.localStorage.getItem(resendStorageKey(email))) || null
    } catch {
        return null
    }
}

/** Recuerda cuándo se mandó el último email de confirmación a ese correo */
export function rememberConfirmationSent(email: string, at = Date.now()) {
    try {
        window.localStorage.setItem(resendStorageKey(email), String(at))
    } catch {
        // Sin almacenamiento la cuenta atrás solo dura mientras la pantalla esté abierta
    }
}

/**
 * Botón «Reenviar el email de confirmación» del registro del coach, con una
 * espera mínima entre reenvíos. Usa el cliente de enlaces por email (flujo
 * implícito) para que el enlace funcione en cualquier navegador.
 */
export function ResendConfirmation({ email, className }: { email: string; className?: string }) {
    const target = email.trim()
    const [lastSent, setLastSent] = useState<number | null>(null)
    const [now, setNow] = useState(() => Date.now())
    const [loading, setLoading] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setLastSent(target ? readLastSent(target) : null)
        setNotice(null)
        setError(null)
    }, [target])

    const wait = secondsUntilResend(lastSent, now)
    const counting = wait > 0

    useEffect(() => {
        if (!counting) return
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [counting])

    const resend = async () => {
        if (!target || wait > 0 || loading) return
        setLoading(true)
        setNotice(null)
        setError(null)
        try {
            const { error: resendError } = await createEmailLinkClient().auth.resend({
                type: 'signup',
                email: target,
                options: { emailRedirectTo: signupRedirectUrl(window.location.origin) },
            })
            const sentAt = Date.now()
            if (resendError) {
                if (classifyAuthError(resendError) === 'rate_limited') {
                    const retryAfter = retryAfterFromMessage(resendError.message)
                    if (retryAfter) {
                        const equivalent = lastSentForRetryAfter(sentAt, retryAfter)
                        setLastSent(equivalent)
                        rememberConfirmationSent(target, equivalent)
                        setNow(sentAt)
                        setError(`Acabamos de enviarte uno. Podrás pedir otro en ${formatWait(retryAfter)}.`)
                        return
                    }
                }
                setError(authErrorMessage(resendError))
                return
            }
            setLastSent(sentAt)
            rememberConfirmationSent(target, sentAt)
            setNow(sentAt)
            setNotice(`Te hemos enviado otro enlace a ${target}. Puede tardar un par de minutos.`)
        } catch (err) {
            setError(authErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={cn('space-y-3', className)}>
            <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl text-[15px] font-semibold"
                onClick={resend}
                disabled={!target || loading || wait > 0}
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                {loading ? 'Enviando…' : wait > 0 ? `Reenviar el email en ${formatWait(wait)}` : 'Reenviar el email de confirmación'}
            </Button>
            {notice && <AuthAlert tone="success">{notice}</AuthAlert>}
            {error && <AuthAlert tone="error">{error}</AuthAlert>}
        </div>
    )
}
