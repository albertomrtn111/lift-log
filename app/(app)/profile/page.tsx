'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'
import type React from 'react'
import { Switch } from '@/components/ui/switch'
import {
    AlertCircle,
    Briefcase,
    Camera,
    ClipboardCheck,
    KeyRound,
    Loader2,
    LogOut,
    MessageCircle,
    MessagesSquare,
    Pencil,
    Pill,
    UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { useAppMode } from '@/hooks/use-app-mode'
import { APP_MODE_COOKIE, type AppMode } from '@/lib/mode-utils'
import type { UserRole } from '@/types/coach'
import { RoleDebugPanel } from '@/components/debug/RoleDebugPanel'
import { StravaConnectorCard } from '@/components/strava/StravaConnectorCard'
import { ClientPageHeader, SettingsGroup, SettingsRow } from '@/components/profile/settings-list'
import {
    getNotificationPreferencesAction,
    updateAvatarUrlAction,
    updateNotificationPreferencesAction,
} from './actions'
import ProfileLoading from './loading'

type ClientNotificationPreferences = {
    messages_enabled: boolean
    reviews_enabled: boolean
    supplements_enabled: boolean
}

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
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [loggingOut, setLoggingOut] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [currentMode, setCurrentMode] = useState<AppMode | undefined>(undefined)
    const [notificationPreferences, setNotificationPreferences] = useState<ClientNotificationPreferences>({
        messages_enabled: true,
        reviews_enabled: true,
        supplements_enabled: true,
    })
    const [loadingNotificationPreferences, setLoadingNotificationPreferences] = useState(true)
    const [savingNotificationKey, setSavingNotificationKey] = useState<keyof ClientNotificationPreferences | null>(null)

    const { client, isLoading, error } = useClientAppContext()

    useEffect(() => {
        const mode = getCookie(APP_MODE_COOKIE) as AppMode | undefined
        setCurrentMode(mode)
    }, [])

    useEffect(() => {
        let isMounted = true

        async function loadNotificationPreferences() {
            const result = await getNotificationPreferencesAction()
            if (!isMounted) return

            if (result.success && result.preferences) {
                setNotificationPreferences(result.preferences)
            } else if (result.error) {
                console.error('[ProfilePage] Notification preferences:', result.error)
            }
            setLoadingNotificationPreferences(false)
        }

        loadNotificationPreferences()
        return () => {
            isMounted = false
        }
    }, [])

    const handleNotificationToggle = async (
        key: keyof ClientNotificationPreferences,
        checked: boolean
    ) => {
        const previous = notificationPreferences
        const next = { ...notificationPreferences, [key]: checked }
        setNotificationPreferences(next)
        setSavingNotificationKey(key)

        const result = await updateNotificationPreferencesAction(next)
        setSavingNotificationKey(null)

        if (result.success && result.preferences) {
            setNotificationPreferences(result.preferences)
            toast.success('Preferencias de notificación actualizadas')
        } else {
            setNotificationPreferences(previous)
            toast.error(result.error || 'No se pudieron actualizar las notificaciones')
        }
    }

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            deleteCookie(APP_MODE_COOKIE)
            const supabase = createClient()
            await supabase.auth.signOut({ scope: 'local' })
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
            // El avatar del header y del perfil vienen de react-query, no del
            // server render: invalidar para que la foto nueva se vea al momento.
            await queryClient.invalidateQueries({ queryKey: ['client-context'] })
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

    if (isLoading) return <ProfileLoading />

    if (error || !client) {
        return (
            <div className="app-mobile-page min-h-screen pb-6">
                <ClientPageHeader eyebrow="Cuenta" title="Perfil" />
                <div className="flex flex-col items-center px-8 pt-16 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                    </div>
                    <p className="text-sm font-semibold">No se pudo cargar tu perfil</p>
                    <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                        {error?.message || 'No se encontró información del usuario.'}
                    </p>
                    <button
                        type="button"
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
                    >
                        {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                        Cerrar sesión
                    </button>
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
        <div className="app-mobile-page min-h-screen pb-6">
            <ClientPageHeader eyebrow="Cuenta" title="Perfil" />

            <div className="space-y-6 px-4 pt-5 animate-fade-in">
                {/* Identidad */}
                <section className="flex flex-col items-center text-center">
                    <div className="relative">
                        <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-2xl font-bold text-primary ring-4 ring-background shadow-md">
                            {profile?.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                            ) : initials}
                        </span>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            aria-label="Cambiar foto de perfil"
                            className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-background bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 disabled:opacity-60"
                        >
                            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleAvatarUpload}
                        />
                    </div>
                    <h2 className="mt-3 max-w-full truncate text-xl font-bold tracking-tight">{displayName}</h2>
                    <p className="max-w-full truncate text-sm text-muted-foreground">{displayEmail}</p>
                    <button
                        type="button"
                        onClick={() => router.push('/profile/settings')}
                        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar perfil
                    </button>
                </section>

                {userRole === 'both' && (
                    <ModeSwitchGroup role={userRole} currentMode={currentMode} />
                )}

                <section>
                    <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conectores</h2>
                    <StravaConnectorCard />
                </section>

                <SettingsGroup
                    title="Notificaciones"
                    footer="Los avisos llegan como notificaciones push al móvil si las tienes activadas."
                >
                    <NotificationPreferenceRow
                        icon={MessageCircle}
                        iconTone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        title="Mensajes"
                        description="Cuando tu entrenador te escribe"
                        checked={notificationPreferences.messages_enabled}
                        disabled={loadingNotificationPreferences || savingNotificationKey === 'messages_enabled'}
                        onCheckedChange={(checked) => handleNotificationToggle('messages_enabled', checked)}
                    />
                    <NotificationPreferenceRow
                        icon={ClipboardCheck}
                        iconTone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        title="Revisiones"
                        description="Nuevas revisiones, aprobaciones y feedback"
                        checked={notificationPreferences.reviews_enabled}
                        disabled={loadingNotificationPreferences || savingNotificationKey === 'reviews_enabled'}
                        onCheckedChange={(checked) => handleNotificationToggle('reviews_enabled', checked)}
                    />
                    <NotificationPreferenceRow
                        icon={Pill}
                        iconTone="bg-teal-500/10 text-teal-600 dark:text-teal-400"
                        title="Suplementación"
                        description="Recordatorios para marcar tus tomas"
                        checked={notificationPreferences.supplements_enabled}
                        disabled={loadingNotificationPreferences || savingNotificationKey === 'supplements_enabled'}
                        onCheckedChange={(checked) => handleNotificationToggle('supplements_enabled', checked)}
                    />
                </SettingsGroup>

                <SettingsGroup title="Cuenta">
                    <SettingsRow icon={UserRound} title="Datos personales" description="Nombre y email" href="/profile/settings" />
                    <SettingsRow
                        icon={KeyRound}
                        iconTone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        title="Contraseña"
                        description="Cámbiala para mantener tu cuenta segura"
                        href="/profile/settings?password=1"
                    />
                </SettingsGroup>

                <SettingsGroup title="Ayuda">
                    <SettingsRow
                        icon={MessagesSquare}
                        iconTone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        title="Escribe a tu entrenador"
                        description="Dudas sobre tu plan o sobre la app"
                        href="/chat"
                    />
                </SettingsGroup>

                <RoleDebugPanel />

                <SettingsGroup>
                    <SettingsRow
                        icon={LogOut}
                        title={loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                        onClick={handleLogout}
                        loading={loggingOut}
                        disabled={loggingOut}
                        destructive
                        showChevron={false}
                    />
                </SettingsGroup>

                <p className="pb-2 text-center text-[11px] text-muted-foreground/70">NexTrain · v1.0.0</p>
            </div>
        </div>
    )
}

function ModeSwitchGroup({ role, currentMode }: { role: UserRole; currentMode?: AppMode }) {
    const { setMode, canSwitch } = useAppMode({ role, initialMode: currentMode })
    if (!canSwitch) return null

    return (
        <SettingsGroup title="Modo">
            <SettingsRow
                icon={Briefcase}
                iconTone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                title="Cambiar a modo coach"
                description="Tienes acceso como atleta y como entrenador"
                onClick={() => setMode('coach')}
            />
        </SettingsGroup>
    )
}

function NotificationPreferenceRow({
    icon,
    iconTone,
    title,
    description,
    checked,
    disabled,
    onCheckedChange,
}: {
    icon: React.ElementType
    iconTone: string
    title: string
    description: string
    checked: boolean
    disabled: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    return (
        <SettingsRow
            icon={icon}
            iconTone={iconTone}
            title={title}
            description={description}
            trailing={
                <Switch
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={onCheckedChange}
                    aria-label={`Activar notificaciones de ${title.toLowerCase()}`}
                />
            }
        />
    )
}
