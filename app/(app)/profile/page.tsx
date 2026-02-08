'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    User,
    Mail,
    ChevronRight,
    LogOut,
    Settings,
    HelpCircle,
    Loader2,
    Briefcase,
    AlertCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { ModeSwitch } from '@/components/layout/ModeSwitch'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { APP_MODE_COOKIE, type AppMode } from '@/lib/mode-utils'
import { RoleDebugPanel } from '@/components/debug/RoleDebugPanel'

function getCookie(name: string): string | undefined {
    if (typeof document === 'undefined') return undefined
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()?.split(';').shift()
    return undefined
}

function deleteCookie(name: string) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

export default function ProfilePage() {
    const router = useRouter()
    const [loggingOut, setLoggingOut] = useState(false)
    const [currentMode, setCurrentMode] = useState<AppMode | undefined>(undefined)

    const { client, isLoading, error } = useClientAppContext()

    // Get current mode from cookie on client
    useEffect(() => {
        const mode = getCookie(APP_MODE_COOKIE) as AppMode | undefined
        setCurrentMode(mode)
    }, [])

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            // Clear mode cookie on logout
            deleteCookie(APP_MODE_COOKIE)

            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
        } catch (err) {
            console.error('Error signing out:', err)
            setLoggingOut(false)
        }
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen pb-4">
                <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                    <div className="px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-foreground">Perfil</h1>
                                <p className="text-sm text-muted-foreground">Tu información</p>
                            </div>
                        </div>
                    </div>
                </header>
                <div className="px-4 pt-4 space-y-4">
                    <Card className="p-6 text-center">
                        <Skeleton className="w-20 h-20 rounded-full mx-auto mb-4" />
                        <Skeleton className="h-6 w-32 mx-auto mb-2" />
                        <Skeleton className="h-4 w-48 mx-auto" />
                    </Card>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !client) {
        return (
            <div className="min-h-screen pb-4">
                <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                    <div className="px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                                <AlertCircle className="h-5 w-5 text-destructive" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-foreground">Error</h1>
                                <p className="text-sm text-muted-foreground">No se pudo cargar el perfil</p>
                            </div>
                        </div>
                    </div>
                </header>
                <div className="px-4 pt-4 space-y-4">
                    <Card className="p-6 text-center">
                        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                        <h2 className="text-lg font-semibold mb-2">Sin perfil</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            {error?.message || 'No se encontró información del usuario'}
                        </p>
                        <Button variant="outline" onClick={handleLogout}>
                            <LogOut className="h-4 w-4 mr-2" />
                            Cerrar sesión
                        </Button>
                    </Card>
                </div>
            </div>
        )
    }

    const profile = client.profile
    const displayName = profile?.full_name || 'Usuario'
    const displayEmail = profile?.email || 'Sin email'
    const initials = displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U'

    const userRole = client.role
    const modeLabel = currentMode === 'coach' ? 'Modo Coach' : 'Modo Cliente'

    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Perfil</h1>
                            <p className="text-sm text-muted-foreground">Tu información</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 pt-4 space-y-4">
                {/* Profile card */}
                <Card className="p-6 text-center">
                    <Avatar className="w-20 h-20 mx-auto mb-4 ring-4 ring-primary/10">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <h2 className="text-xl font-bold">{displayName}</h2>
                    <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                        <Mail className="h-3 w-3" />
                        {displayEmail}
                    </p>

                    {/* Current mode badge */}
                    <Badge variant="secondary" className="mt-3">
                        {modeLabel}
                    </Badge>
                </Card>

                {/* Mode Switch (if dual role) */}
                {userRole === 'both' && (
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <Briefcase className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <p className="font-semibold">Cambiar modo</p>
                                    <p className="text-sm text-muted-foreground">
                                        Tienes acceso dual
                                    </p>
                                </div>
                            </div>
                            <ModeSwitch role={userRole} currentMode={currentMode} variant="toggle" />
                        </div>
                    </Card>
                )}

                {/* Debug Panel at bottom in dev */}
                <RoleDebugPanel />

                {/* Menu items */}
                <Card className="divide-y divide-border">
                    <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                        <Settings className="h-5 w-5 text-muted-foreground" />
                        <span className="flex-1 text-left font-medium">Configuración</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                        <HelpCircle className="h-5 w-5 text-muted-foreground" />
                        <span className="flex-1 text-left font-medium">Ayuda</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-destructive disabled:opacity-50"
                    >
                        {loggingOut ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <LogOut className="h-5 w-5" />
                        )}
                        <span className="flex-1 text-left font-medium">
                            {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
                        </span>
                    </button>
                </Card>

                {/* Version */}
                <p className="text-center text-xs text-muted-foreground">
                    LiftLog v1.0.0
                </p>
            </div>
        </div>
    )
}
