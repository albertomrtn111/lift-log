'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Link2Off, Loader2, LogIn, UserRoundPlus, UsersRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthStatus } from '@/components/auth/AuthShell'
import { AuthAlert } from '@/components/auth/AuthFields'
import { authErrorMessage, classifyAuthError } from '@/lib/auth/auth-errors'
import { openInviteAction } from './actions'

type Kind = 'athlete' | 'team'

const COPY: Record<Kind, { icon: React.ElementType; title: string; text: string; button: string }> = {
    athlete: {
        icon: UserRoundPlus,
        title: 'Activa tu acceso',
        text: 'Pulsa el botón para entrar en NexTrain y crear tu contraseña.',
        button: 'Crear mi acceso',
    },
    team: {
        icon: UsersRound,
        title: 'Únete al equipo',
        text: 'Pulsa el botón para entrar en NexTrain y aceptar la invitación.',
        button: 'Aceptar la invitación',
    },
}

export function InviteBroken({ reason, kind }: { reason: 'expired' | 'gone'; kind?: Kind }) {
    // Con un enlace caducado o roto no se sabe de qué invitación era
    const who = kind === 'athlete' ? 'a tu entrenador' : 'a quien te invitó'
    return (
        <AuthStatus
            icon={Link2Off}
            tone="destructive"
            title={reason === 'expired' ? 'Esta invitación ha caducado' : 'Esta invitación ya no sirve'}
            actions={
                <>
                    <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                        <Link href="/login">Ir a iniciar sesión</Link>
                    </Button>
                    <Button asChild variant="ghost" className="h-10 rounded-xl">
                        <Link href="/forgot-password">He olvidado mi contraseña</Link>
                    </Button>
                </>
            }
        >
            <p>
                {reason === 'expired'
                    ? 'Las invitaciones valen 7 días.'
                    : 'Puede que la hayan anulado o que el enlace se cortara al copiarlo.'}
            </p>
            <p className="text-sm">{`Pide ${who} que te la reenvíe. Si ya tienes cuenta, inicia sesión.`}</p>
        </AuthStatus>
    )
}

function AlreadyActive() {
    return (
        <AuthStatus
            icon={LogIn}
            tone="success"
            title="Ya tienes tu acceso"
            actions={
                <>
                    <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                        <Link href="/login">Iniciar sesión</Link>
                    </Button>
                    <Button asChild variant="ghost" className="h-10 rounded-xl">
                        <Link href="/forgot-password">He olvidado mi contraseña</Link>
                    </Button>
                </>
            }
        >
            <p>Esta invitación ya se usó. Entra con tu email y tu contraseña.</p>
        </AuthStatus>
    )
}

export function InviteAccess({ token, kind }: { token: string; kind: Kind }) {
    const [state, setState] = useState<'ready' | 'working' | 'done' | 'login' | 'expired' | 'gone'>('ready')
    const [error, setError] = useState<string | null>(null)
    const copy = COPY[kind]

    const open = async () => {
        setState('working')
        setError(null)
        try {
            const result = await openInviteAction(token)
            if (result.status === 'login' || result.status === 'expired' || result.status === 'gone') {
                setState(result.status)
                return
            }
            if (result.status !== 'access') {
                setError('No hemos podido preparar tu acceso. Vuelve a intentarlo en un momento.')
                setState('ready')
                return
            }
            const supabase = createClient()
            const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: result.type })
            if (verifyError || !data.session) {
                if (verifyError) console.warn('[auth/invitacion] verifyOtp:', verifyError.message)
                const kindOfError = verifyError ? classifyAuthError(verifyError) : null
                setError(kindOfError === 'network' || kindOfError === 'rate_limited'
                    ? authErrorMessage(verifyError)
                    : 'No hemos podido abrir tu acceso. Vuelve a pulsar el botón.')
                setState('ready')
                return
            }
            setState('done')
            // Carga completa para que el servidor vea la sesión nueva
            window.location.replace(result.next)
        } catch (err) {
            setError(authErrorMessage(err))
            setState('ready')
        }
    }

    if (state === 'login') return <AlreadyActive />
    if (state === 'expired' || state === 'gone') return <InviteBroken reason={state} kind={kind} />
    if (state === 'done') {
        return <AuthStatus icon={Loader2} spin tone="success" title="Listo"><p>Entrando en tu cuenta…</p></AuthStatus>
    }

    return (
        <AuthStatus
            icon={copy.icon}
            title={copy.title}
            actions={
                <Button size="lg" className="h-11 rounded-xl text-[15px] font-semibold" onClick={open} disabled={state === 'working'}>
                    {state === 'working' ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparando tu acceso…</> : copy.button}
                </Button>
            }
        >
            <p>{copy.text}</p>
            {kind === 'athlete' && <p className="text-sm">Hazlo en el móvil donde vas a usar la app: la sesión quedará iniciada ahí.</p>}
            {error && <AuthAlert tone="error">{error}</AuthAlert>}
        </AuthStatus>
    )
}
