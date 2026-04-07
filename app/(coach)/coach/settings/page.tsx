'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { Headphones, MoonStar, Paintbrush, SunMedium } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/sonner'

const THEME_OPTIONS = [
    {
        value: 'light' as const,
        label: 'Claro',
        description: 'Interfaz luminosa, limpia y pensada para trabajo diurno.',
        icon: SunMedium,
    },
    {
        value: 'dark' as const,
        label: 'Oscuro',
        description: 'Look premium azul oscuro con menos fatiga visual en entornos oscuros.',
        icon: MoonStar,
    },
]

export default function CoachSettingsPage() {
    const { theme, resolvedTheme, setTheme } = useTheme()
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const activeTheme = useMemo(() => {
        if (!isMounted) return null
        return theme === 'system' ? resolvedTheme : theme
    }, [isMounted, theme, resolvedTheme])

    const handleSupportClick = () => {
        toast('Soporte próximamente', {
            description: 'Dejamos este acceso preparado para conectar soporte real en la siguiente fase.',
        })
    }

    return (
        <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
                <header className="space-y-3">
                    <Badge variant="outline" className="w-fit">
                        Configuración
                    </Badge>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                            Ajustes
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                            Personaliza tu experiencia y gestiona opciones básicas de la cuenta.
                        </p>
                    </div>
                </header>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <Card className="subtle-panel">
                        <CardHeader className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                                    <Paintbrush className="h-5 w-5" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">Apariencia</CardTitle>
                                    <CardDescription>
                                        Elige cómo quieres ver la app. La selección se guarda y se mantiene al volver a entrar.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {THEME_OPTIONS.map((option) => {
                                    const Icon = option.icon
                                    const isActive = activeTheme === option.value

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setTheme(option.value)}
                                            className={cn(
                                                'rounded-2xl border p-4 text-left transition-all',
                                                'hover:border-primary/40 hover:bg-accent/40',
                                                isActive
                                                    ? 'border-primary/50 bg-primary/10 shadow-sm'
                                                    : 'border-border/70 bg-background/40'
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-2">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground">
                                                        <Icon className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-foreground">
                                                            {option.label}
                                                        </p>
                                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                            {option.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                {isActive ? (
                                                    <Badge className="border-0 bg-primary text-primary-foreground">
                                                        Activo
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                                {isMounted ? (
                                    theme === 'system' ? (
                                        <>Ahora mismo sigues el tema del sistema. En cuanto elijas <span className="font-medium text-foreground">Claro</span> u <span className="font-medium text-foreground">Oscuro</span>, esa preferencia quedará fijada para tu cuenta en este navegador.</>
                                    ) : (
                                        <>Tema manual activo: <span className="font-medium text-foreground">{activeTheme === 'dark' ? 'Oscuro' : 'Claro'}</span>.</>
                                    )
                                ) : (
                                    <>Cargando preferencia visual…</>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="subtle-panel">
                        <CardHeader className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground ring-1 ring-border/60">
                                    <Headphones className="h-5 w-5" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">Contactar con soporte</CardTitle>
                                    <CardDescription>
                                        Acceso preparado para incidencias, dudas de producto y ayuda operativa.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 px-4 py-4 text-sm leading-6 text-muted-foreground">
                                Estamos dejando esta base lista para conectar el canal de soporte real en una siguiente iteración, sin romper la navegación ni la jerarquía de configuración.
                            </div>

                            <Button onClick={handleSupportClick} className="w-full sm:w-auto">
                                Contactar con soporte
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
