'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { createEmailLinkClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthHeading, AuthShell, AuthStatus } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, AuthInput } from '@/components/auth/AuthFields'
import { authErrorMessage, classifyAuthError } from '@/lib/auth/auth-errors'

function ForgotPasswordForm() {
    const searchParams = useSearchParams()
    const [email, setEmail] = useState(searchParams.get('email') ?? '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sentTo, setSentTo] = useState<string | null>(null)

    const sendLink = async (e?: React.FormEvent) => {
        e?.preventDefault()
        const target = (sentTo ?? email).trim()
        if (!target) return
        setError(null)
        setLoading(true)
        try {
            const supabase = createEmailLinkClient()
            const next = encodeURIComponent('/set-password?mode=reset')
            const { error } = await supabase.auth.resetPasswordForEmail(target, {
                redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
            })
            // Por privacidad no decimos si el email existe: solo mostramos errores de formato o de límite
            if (error && ['rate_limited', 'invalid_email', 'network'].includes(classifyAuthError(error))) {
                setError(authErrorMessage(error))
            } else {
                setSentTo(target)
            }
        } catch (err) {
            setError(authErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    if (sentTo) {
        return (
            <AuthStatus
                icon={MailCheck}
                tone="success"
                title="Revisa tu correo"
                actions={
                    <>
                        <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                            <Link href={`/login?email=${encodeURIComponent(sentTo)}`}>Volver a iniciar sesión</Link>
                        </Button>
                        <Button variant="ghost" className="h-10 rounded-xl" onClick={() => sendLink()} disabled={loading}>
                            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                            Reenviar el enlace
                        </Button>
                    </>
                }
            >
                <p>
                    Si hay una cuenta con <span className="font-semibold text-foreground">{sentTo}</span>, te llegará un enlace para crear una contraseña nueva. Caduca en una hora.
                </p>
                <p className="text-sm">Si no lo ves, mira en spam o promociones.</p>
                {error && <AuthAlert tone="error">{error}</AuthAlert>}
            </AuthStatus>
        )
    }

    return (
        <>
        <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <AuthHeading
            title="Recupera tu acceso"
            description="Escribe tu email y te enviaremos un enlace para crear una contraseña nueva. También sirve si te invitó tu entrenador y aún no tienes contraseña."
        />
        <form onSubmit={sendLink} className="space-y-5">
            <AuthField id="email" label="Email">
                <AuthInput
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    disabled={loading}
                />
            </AuthField>

            {error && <AuthAlert tone="error">{error}</AuthAlert>}

            <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-[15px] font-semibold" disabled={loading || !email.trim()}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : 'Enviarme el enlace'}
            </Button>
        </form>
        </>
    )
}

export default function ForgotPasswordPage() {
    return (
        <AuthShell
            topRight={<Link href="/login" className="font-medium text-foreground hover:text-primary">Iniciar sesión</Link>}
            panelTitle={<>Vuelve a tu entreno<br /><span className="text-white/50">en un minuto.</span></>}
        >
            <Suspense fallback={<div className="flex h-[140px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <ForgotPasswordForm />
            </Suspense>
        </AuthShell>
    )
}
