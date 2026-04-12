'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'

// Extracted so useSearchParams() is inside a Suspense boundary (Next.js 14 requirement)
function LoginForm() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                setError(error.message)
                return
            }

            // If there's a redirect param (e.g. /forms/[checkinId]), send the user there.
            // Otherwise fall back to root which handles smart routing based on role.
            const redirectTo = searchParams.get('redirect') ?? '/'
            router.push(redirectTo)
            router.refresh()
        } catch {
            setError('Error inesperado. Por favor, inténtalo de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleLogin} className="space-y-4">
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
                        Iniciando sesión...
                    </>
                ) : (
                    'Iniciar sesión'
                )}
            </Button>
        </form>
    )
}

export default function LoginPage() {
    return (
        <Card className="w-full max-w-md p-8">
            <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4 h-16 w-16 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:bg-white">
                    <Image
                        src="/Logo_nexttrain.png"
                        alt="NexTrain"
                        fill
                        sizes="64px"
                        className="object-cover"
                        priority
                    />
                </div>
                <h1 className="text-2xl font-bold">NexTrain</h1>
                <p className="text-muted-foreground text-sm mt-1">Inicia sesión para continuar</p>
            </div>

            <Suspense fallback={<div className="h-[200px] flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <LoginForm />
            </Suspense>

            <p className="text-center text-sm text-muted-foreground mt-6">
                ¿No tienes cuenta?{' '}
                <Link href="/signup" className="text-primary hover:underline">
                    Regístrate
                </Link>
            </p>
        </Card>
    )
}
