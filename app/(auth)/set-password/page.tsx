'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dumbbell, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function SetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [checking, setChecking] = useState(true)
    const [hasSession, setHasSession] = useState(false)
    const [success, setSuccess] = useState(false)
    const router = useRouter()

    // Check for active session on mount
    useEffect(() => {
        const checkSession = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            setHasSession(!!user)
            setChecking(false)
        }
        checkSession()
    }, [])

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Validate
        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres')
            return
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden')
            return
        }

        setLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.updateUser({
                password,
            })

            if (error) {
                console.error('[SetPassword] Error:', error)
                setError(error.message)
                return
            }

            setSuccess(true)

            // Redirect to app after short delay
            setTimeout(() => {
                router.push('/')
                router.refresh()
            }, 2000)
        } catch {
            setError('Error inesperado. Por favor, inténtalo de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    // Loading state while checking session
    if (checking) {
        return (
            <Card className="w-full max-w-md p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-4">Verificando sesión...</p>
            </Card>
        )
    }

    // No session — invite link expired or invalid
    if (!hasSession) {
        return (
            <Card className="w-full max-w-md p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold">Enlace expirado</h1>
                <p className="text-muted-foreground text-sm">
                    Tu enlace de invitación ha expirado o no es válido.
                    Solicita un nuevo enlace a tu entrenador o recupera tu contraseña.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                    <Button asChild className="w-full">
                        <Link href="/login">Iniciar sesión</Link>
                    </Button>
                </div>
            </Card>
        )
    }

    // Success state
    if (success) {
        return (
            <Card className="w-full max-w-md p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <h1 className="text-2xl font-bold">¡Contraseña creada!</h1>
                <p className="text-muted-foreground text-sm">
                    Tu contraseña ha sido configurada correctamente. Redirigiendo a tu panel...
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirigiendo...
                </div>
            </Card>
        )
    }

    // Set password form
    return (
        <Card className="w-full max-w-md p-8">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Dumbbell className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">Configura tu contraseña</h1>
                <p className="text-muted-foreground text-sm mt-1 text-center">
                    Crea una contraseña para poder iniciar sesión en NextTrain en el futuro.
                </p>
            </div>

            <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="password">Nueva contraseña</Label>
                    <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                        autoFocus
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                    <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                    />
                </div>

                {error && (
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                        {error}
                    </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        'Guardar contraseña'
                    )}
                </Button>
            </form>
        </Card>
    )
}
