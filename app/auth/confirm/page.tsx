'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { KeyRound, Link2Off, Loader2, MailCheck, UserRoundPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthShell, AuthStatus } from '@/components/auth/AuthShell'
import { AuthAlert } from '@/components/auth/AuthFields'
import { authErrorMessage, classifyAuthError } from '@/lib/auth/auth-errors'
import { parseEmailConfirmParams, type EmailLinkType } from '@/lib/auth/email-links'

/**
 * Enlaces de los correos de cuenta de Supabase (supabase/templates/):
 * /auth/confirm?token_hash=…&type=…&next=…
 *
 * El enlace se valida con verifyOtp al pulsar el botón, no al abrir la página:
 * - funciona en cualquier navegador o dispositivo (no depende del PKCE);
 * - los antivirus del correo (Outlook, Defender…) que abren los enlaces antes
 *   que la persona no lo gastan.
 */

const COPY: Record<EmailLinkType, { icon: React.ElementType; title: string; text: string; button: string }> = {
    email: {
        icon: MailCheck,
        title: 'Confirma tu email',
        text: 'Pulsa el botón para confirmar tu email y entrar en NexTrain.',
        button: 'Confirmar y entrar',
    },
    recovery: {
        icon: KeyRound,
        title: 'Crea tu contraseña nueva',
        text: 'Pulsa el botón y elige una contraseña nueva para tu cuenta.',
        button: 'Crear contraseña nueva',
    },
    invite: {
        icon: UserRoundPlus,
        title: 'Activa tu acceso',
        text: 'Pulsa el botón para entrar y crear tu contraseña.',
        button: 'Crear mi acceso',
    },
    email_change: {
        icon: MailCheck,
        title: 'Confirma tu email nuevo',
        text: 'Pulsa el botón para confirmar el cambio de email de tu cuenta.',
        button: 'Confirmar el cambio',
    },
}

function LoadingUI() {
    return (
        <AuthShell>
            <AuthStatus icon={Loader2} spin tone="muted" title="Comprobando tu enlace…" />
        </AuthShell>
    )
}

function BrokenLink({ type, reason }: { type: EmailLinkType | null; reason: string }) {
    const primary = type === 'recovery' || type === 'invite'
        ? { href: '/forgot-password', label: 'Pedir un enlace nuevo' }
        : { href: '/login', label: 'Ir a iniciar sesión' }
    const secondary = primary.href === '/login'
        ? { href: '/forgot-password', label: 'He olvidado mi contraseña' }
        : { href: '/login', label: 'Ir a iniciar sesión' }
    const help = type === 'invite'
        ? 'Pide uno nuevo con tu email o pide a tu entrenador que te reenvíe la invitación.'
        : type === 'recovery'
            ? 'Pide uno nuevo con tu email; el último que te enviemos es el que vale.'
            : type === 'email_change'
                ? 'Inicia sesión y vuelve a pedir el cambio de email.'
                : '¿Acabas de crear tu cuenta? Inicia sesión: si aún falta confirmar tu email, allí podrás pedir otro enlace.'
    return (
        <AuthStatus
            icon={Link2Off}
            tone="destructive"
            title="Este enlace ya no sirve"
            actions={
                <>
                    <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                        <Link href={primary.href}>{primary.label}</Link>
                    </Button>
                    <Button asChild variant="ghost" className="h-10 rounded-xl">
                        <Link href={secondary.href}>{secondary.label}</Link>
                    </Button>
                </>
            }
        >
            <p>{reason}</p>
            <p className="text-sm">{help}</p>
        </AuthStatus>
    )
}

function ConfirmInner() {
    const searchParams = useSearchParams()
    const params = useMemo(() => parseEmailConfirmParams(new URLSearchParams(searchParams.toString())), [searchParams])
    const [state, setState] = useState<'ready' | 'verifying' | 'done' | 'other_email' | 'broken'>('ready')
    const [error, setError] = useState<string | null>(null)

    if (!params) {
        return <BrokenLink type={null} reason="El enlace está incompleto. Puede que se cortara al copiarlo." />
    }

    const copy = COPY[params.type]

    const confirm = async () => {
        setState('verifying')
        setError(null)
        try {
            const supabase = createClient()
            const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type })
            if (verifyError) {
                const kind = classifyAuthError(verifyError)
                if (kind === 'network' || kind === 'rate_limited') {
                    setError(authErrorMessage(verifyError))
                    setState('ready')
                    return
                }
                console.warn('[auth/confirm] verifyOtp:', verifyError.message)
                setState('broken')
                return
            }
            if (!data.session) {
                // Cambio de email con confirmación en los dos correos: falta el otro
                setState(params.type === 'email_change' ? 'other_email' : 'broken')
                return
            }
            setState('done')
            // Carga completa para que el servidor vea la sesión nueva
            window.location.replace(params.next)
        } catch (err) {
            setError(authErrorMessage(err))
            setState('ready')
        }
    }

    if (state === 'broken') {
        return <BrokenLink type={params.type} reason="Ha caducado o ya se usó." />
    }

    if (state === 'other_email') {
        return (
            <AuthStatus
                icon={MailCheck}
                tone="success"
                title="Falta un paso"
                actions={
                    <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                        <Link href="/login">Ir a iniciar sesión</Link>
                    </Button>
                }
            >
                <p>Hemos confirmado este email. Abre también el enlace que te enviamos al otro correo para terminar el cambio.</p>
            </AuthStatus>
        )
    }

    if (state === 'done') {
        return <AuthStatus icon={Loader2} spin tone="success" title="Listo"><p>Entrando en tu cuenta…</p></AuthStatus>
    }

    return (
        <AuthStatus
            icon={copy.icon}
            title={copy.title}
            actions={
                <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={confirm} disabled={state === 'verifying'}>
                    {state === 'verifying' ? <><Loader2 className="h-4 w-4 animate-spin" /> Comprobando…</> : copy.button}
                </Button>
            }
        >
            <p>{copy.text}</p>
            <p className="text-sm">Puedes hacerlo en este dispositivo aunque pidieras el enlace en otro.</p>
            {error && <AuthAlert tone="error">{error}</AuthAlert>}
        </AuthStatus>
    )
}

export default function AuthConfirmPage() {
    return (
        <Suspense fallback={<LoadingUI />}>
            <AuthShell>
                <ConfirmInner />
            </AuthShell>
        </Suspense>
    )
}
