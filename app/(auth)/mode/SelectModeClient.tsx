'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Briefcase, Dumbbell } from 'lucide-react'
import { APP_MODE_COOKIE, LAST_MODE_COOKIE, type AppMode, getModeRedirectPath } from '@/lib/mode-utils'
import { useRouter } from 'next/navigation'

function setCookie(name: string, value: string, days: number = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
}

export function SelectModeClient() {
    const router = useRouter()

    const handleSelectMode = (mode: AppMode) => {
        // Set both the current session mode and the sticky preference
        setCookie(APP_MODE_COOKIE, mode)
        setCookie(LAST_MODE_COOKIE, mode)

        router.push(getModeRedirectPath(mode))
        router.refresh()
    }

    return (
        <Card className="w-full max-w-md p-8">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Dumbbell className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">¡Bienvenido de nuevo!</h1>
                <p className="text-muted-foreground text-sm mt-2 text-center">
                    Tienes acceso como cliente y como coach.
                    <br />
                    ¿En qué modo quieres iniciar?
                </p>
            </div>

            <div className="grid gap-4">
                <Button
                    variant="outline"
                    size="lg"
                    className="h-auto p-4 flex flex-col items-center gap-2"
                    onClick={() => handleSelectMode('client')}
                >
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-blue-500" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold">Modo Cliente</p>
                        <p className="text-xs text-muted-foreground">
                            Ver tus entrenamientos y dieta
                        </p>
                    </div>
                </Button>

                <Button
                    variant="outline"
                    size="lg"
                    className="h-auto p-4 flex flex-col items-center gap-2"
                    onClick={() => handleSelectMode('coach')}
                >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <Briefcase className="h-6 w-6 text-amber-500" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold">Modo Coach</p>
                        <p className="text-xs text-muted-foreground">
                            Gestionar tus clientes
                        </p>
                    </div>
                </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-6">
                Puedes cambiar de modo en cualquier momento desde el menú
            </p>
        </Card>
    )
}
