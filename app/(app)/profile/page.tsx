'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRef, useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
    AlertCircle,
    Camera,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ModeSwitch } from '@/components/layout/ModeSwitch'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { APP_MODE_COOKIE, type AppMode } from '@/lib/mode-utils'
import { RoleDebugPanel } from '@/components/debug/RoleDebugPanel'
import { StravaConnectorCard } from '@/components/strava/StravaConnectorCard'
import { updateAvatarUrlAction } from './actions'

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
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [loggingOut, setLoggingOut] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [currentMode, setCurrentMode] = useState<AppMode | undefined>(undefined)

    const { client, isLoading, error } = useClientAppContext()

    useEffect(() => {
        const mode = getCookie(APP_MODE_COOKIE) as AppMode | undefined
        setCurrentMode(mode)
    }, [])

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
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

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const maxSize = 2 * 1024 * 1024 // 2 MB
        if (file.size > maxSize) {
            toast.error('La imagen no puede superar 2 MB')
            return
        }

        setUploading(true)
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('No autenticado')

            const ext = file.name.split('.').pop() ?? 'jpg'
            const path = `${user.id}/avatar.${ext}`

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(path, file, { upsert: true, contentType: file.type })

            if (uploadError) throw uploadError

            // Añadir cache-buster para que el browser no use la imagen anterior
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
            const urlWithBust = `${publicUrl}?t=${Date.now()}`

            const result = await updateAvatarUrlAction(urlWithBust)
            if (!result.success) throw new Error(result.error)

            toast.success('Foto de perfil actualizada')
            router.refresh()
        } catch (err) {
            console.error('[handleAvatarUpload]', err)
            toast.error('No se pudo subir la foto. Inténtalo de nuevo.')
        } finally {
            setUploading(false)
            // Reset input para permitir subir el mismo archivo otra vez
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="app-mobile-page min-h-screen pb-4">
                <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
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
                    <Card className="p-6 flex items-center gap-4">
                        <Skeleton className="w-20 h-20 rounded-full shrink-0" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-3 w-44" />
                        </div>
                    </Card>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !client) {
        return (
            <div className="app-mobile-page min-h-screen pb-4">
                <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
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
                <div className="px-4 pt-4">
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
        .filter(Boolean)
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U'

    const userRole = client.role

    return (
        <div className="app-mobile-page min-h-screen pb-4">
            {/* Header */}
            <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
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
                <Card className="p-5">
                    <div className="flex items-center gap-4">
                        {/* Avatar con botón de cámara */}
                        <div className="relative shrink-0">
                            <Avatar className="w-20 h-20 ring-4 ring-primary/10">
                                <AvatarImage src={profile?.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                aria-label="Cambiar foto de perfil"
                                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md border-2 border-background hover:bg-primary/90 transition-colors disabled:opacity-60"
                            >
                                {uploading
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Camera className="h-3 w-3" />
                                }
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleAvatarUpload}
                            />
                        </div>

                        {/* Nombre y rol */}
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-foreground truncate">{displayName}</h2>
                            <p className="text-sm text-muted-foreground font-medium">Cliente</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 shrink-0" />
                                {displayEmail}
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Mode Switch (si tiene rol dual) */}
                {userRole === 'both' && (
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <Briefcase className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <p className="font-semibold">Cambiar modo</p>
                                    <p className="text-sm text-muted-foreground">Tienes acceso dual</p>
                                </div>
                            </div>
                            <ModeSwitch role={userRole} currentMode={currentMode} variant="toggle" />
                        </div>
                    </Card>
                )}

                {/* Conectores */}
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conectores</h2>
                    <StravaConnectorCard />
                </section>

                <RoleDebugPanel />

                {/* Menú */}
                <Card className="divide-y divide-border">
                    <Link href="/profile/settings" className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                        <Settings className="h-5 w-5 text-muted-foreground" />
                        <span className="flex-1 text-left font-medium">Configuración</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
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
                        {loggingOut
                            ? <Loader2 className="h-5 w-5 animate-spin" />
                            : <LogOut className="h-5 w-5" />
                        }
                        <span className="flex-1 text-left font-medium">
                            {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
                        </span>
                    </button>
                </Card>

                <p className="text-center text-xs text-muted-foreground">NextTrain v1.0.0</p>
            </div>
        </div>
    )
}
