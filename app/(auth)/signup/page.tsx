'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dumbbell, Loader2 } from 'lucide-react'

export default function SignupPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const router = useRouter()

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                    },
                },
            })

            if (error) {
                // Handle "User already registered" specifically
                if (
                    error.message.toLowerCase().includes('already registered') ||
                    error.message.toLowerCase().includes('already been registered') ||
                    error.message.toLowerCase().includes('user already exists')
                ) {
                    setError('ALREADY_REGISTERED')
                } else {
                    setError(error.message)
                }
                return
            }

            setSuccess(true)
        } catch {
            setError('Error inesperado. Por favor, inténtalo de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <Card className="w-full max-w-md p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                    <Dumbbell className="h-8 w-8 text-success" />
                </div>
                <h1 className="text-2xl font-bold mb-2">¡Registro completado!</h1>
                <p className="text-muted-foreground mb-6">
                    Revisa tu correo electrónico para confirmar tu cuenta.
                </p>
                <Button onClick={() => router.push('/login')} className="w-full">
                    Ir a iniciar sesión
                </Button>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-md p-8">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Dumbbell className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">Crear cuenta</h1>
                <p className="text-muted-foreground text-sm mt-1">Únete a NextTrain</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                        id="fullName"
                        type="text"
                        placeholder="Tu nombre"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="tu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                    />
                </div>

                {error === 'ALREADY_REGISTERED' ? (
                    <div className="text-sm bg-amber-500/10 border border-amber-500/30 p-4 rounded-md space-y-2">
                        <p className="font-medium text-amber-600 dark:text-amber-400">
                            Ya tienes una cuenta (o has sido invitado)
                        </p>
                        <p className="text-muted-foreground">
                            Este email ya está registrado. Inicia sesión con tu contraseña o solicita un enlace de recuperación.
                        </p>
                        <div className="flex gap-2 pt-1">
                            <Button asChild variant="outline" size="sm">
                                <Link href="/login">Iniciar sesión</Link>
                            </Button>
                        </div>
                    </div>
                ) : error ? (
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                        {error}
                    </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creando cuenta...
                        </>
                    ) : (
                        'Crear cuenta'
                    )}
                </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
                ¿Ya tienes cuenta?{' '}
                <Link href="/login" className="text-primary hover:underline">
                    Inicia sesión
                </Link>
            </p>
        </Card>
    )
}
