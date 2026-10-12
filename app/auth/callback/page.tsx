'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Link2Off, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { AuthShell, AuthStatus } from '@/components/auth/AuthShell'
import { safeRedirectPath } from '@/lib/auth/auth-errors'

/**
 * Auth Callback — Client Component
 *
 * Supabase invite links return tokens in the URL #hash fragment,
 * which is only accessible client-side. This page handles:
 *
 * 1. ?code=...          → PKCE flow (exchangeCodeForSession)
 * 2. #access_token=...  → Implicit flow (setSession) — used by invites
 * 3. #error=...         → Show error UI
 *
 * After establishing a session, redirects to ?next= (default: /)
 */

function LoadingUI() {
    return (
        <AuthShell>
            <AuthStatus icon={Loader2} spin tone="muted" title="Comprobando tu enlace…">
                <p>Un momento, estamos preparando tu acceso.</p>
            </AuthStatus>
        </AuthShell>
    )
}

function AuthCallbackInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = safeRedirectPath(searchParams.get('next'))

    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const handleCallback = async () => {
            const supabase = createClient()

            try {
                // --- Case 1: PKCE code in query params ---
                const code = searchParams.get('code')
                if (code) {
                    console.log('[auth/callback] Exchanging PKCE code...')
                    const { error } = await supabase.auth.exchangeCodeForSession(code)
                    if (error) {
                        console.error('[auth/callback] Code exchange error:', error.message)
                        setError('El enlace ha caducado, ya se usó o se abrió en otro navegador.')
                        return
                    }
                    console.log('[auth/callback] PKCE session established, redirecting to', next)
                    router.replace(next)
                    return
                }

                // --- Case 2: Hash fragment (invite tokens) ---
                const hash = window.location.hash
                if (hash) {
                    const params = new URLSearchParams(hash.substring(1))

                    // Check for errors in hash
                    const hashError = params.get('error')
                    if (hashError) {
                        const errorCode = params.get('error_code') || ''
                        const errorDesc = params.get('error_description')?.replace(/\+/g, ' ') || ''
                        console.error(`[auth/callback] Hash error: ${hashError} (${errorCode}): ${errorDesc}`)

                        if (errorCode === 'otp_expired' || hashError === 'access_denied') {
                            setError('El enlace ha caducado, ya se usó o se abrió en otro navegador.')
                        } else {
                            setError('No hemos podido validar el enlace.')
                        }
                        return
                    }

                    // Extract tokens
                    const accessToken = params.get('access_token')
                    const refreshToken = params.get('refresh_token')

                    if (accessToken && refreshToken) {
                        console.log('[auth/callback] Setting session from hash tokens...')
                        const { error } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        })

                        if (error) {
                            console.error('[auth/callback] setSession error:', error.message)
                            setError('No hemos podido iniciar tu sesión con este enlace.')
                            return
                        }

                        console.log('[auth/callback] Session established from tokens, redirecting to', next)
                        router.replace(next)
                        return
                    }
                }

                // --- Case 3: Check if session already exists (auto-processed by Supabase SDK) ---
                const { data: { session } } = await supabase.auth.getSession()
                if (session) {
                    console.log('[auth/callback] Session already exists, redirecting to', next)
                    router.replace(next)
                    return
                }

                // No auth data found
                console.warn('[auth/callback] No auth data found')
                setError('El enlace está incompleto o ha caducado.')
            } catch (err: any) {
                console.error('[auth/callback] Unexpected error:', err)
                setError('Algo ha fallado al abrir el enlace.')
            }
        }

        handleCallback()
    }, [searchParams, next, router])

    if (error) {
        return (
            <AuthShell>
                <AuthStatus
                    icon={Link2Off}
                    tone="destructive"
                    title="Este enlace ya no sirve"
                    actions={
                        <>
                            <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                                <Link href="/forgot-password">Pedir un enlace nuevo</Link>
                            </Button>
                            <Button asChild variant="ghost" className="h-10 rounded-xl">
                                <Link href="/login">Ir a iniciar sesión</Link>
                            </Button>
                        </>
                    }
                >
                    <p>{error}</p>
                    <p className="text-sm">Pide uno nuevo con tu email y ábrelo en este mismo dispositivo. Si te invitó tu entrenador, también puedes pedirle que te reenvíe la invitación.</p>
                </AuthStatus>
            </AuthShell>
        )
    }

    return <LoadingUI />
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={<LoadingUI />}>
            <AuthCallbackInner />
        </Suspense>
    )
}
