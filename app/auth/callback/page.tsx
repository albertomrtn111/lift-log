'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

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
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-8 text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <h1 className="text-lg font-semibold">Procesando invitación...</h1>
                <p className="text-sm text-muted-foreground">
                    Estamos verificando tu enlace. Un momento por favor.
                </p>
            </Card>
        </div>
    )
}

function AuthCallbackInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = searchParams.get('next') ?? '/'

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
                        setError('Tu enlace de invitación ha expirado. Solicita uno nuevo a tu entrenador.')
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
                            setError('Tu enlace de invitación ha expirado. Solicita uno nuevo a tu entrenador.')
                        } else {
                            setError(errorDesc || 'Error de autenticación')
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
                            setError('Error al establecer la sesión. Inténtalo de nuevo.')
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
                setError('No se encontraron datos de autenticación. El enlace puede haber expirado.')
            } catch (err: any) {
                console.error('[auth/callback] Unexpected error:', err)
                setError('Error inesperado. Inténtalo de nuevo.')
            }
        }

        handleCallback()
    }, [searchParams, next, router])

    // Error state
    if (error) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h1 className="text-2xl font-bold">Enlace expirado</h1>
                    <p className="text-muted-foreground text-sm">{error}</p>
                    <div className="flex flex-col gap-2 pt-2">
                        <Button asChild className="w-full">
                            <Link href="/login">Ir a iniciar sesión</Link>
                        </Button>
                    </div>
                </Card>
            </div>
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
