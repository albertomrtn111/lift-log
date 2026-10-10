'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { updateProfileNameAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, ChevronLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ClientPageHeader, SettingsGroup, SettingsRow } from '@/components/profile/settings-list'

interface ProfileData {
    email: string
    full_name: string
}

export default function ProfileSettingsPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const supabase = createClient()

    // Profile data
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)

    // Name editing
    const [name, setName] = useState('')
    const [savingName, setSavingName] = useState(false)

    // Password modal
    const [passwordOpen, setPasswordOpen] = useState(false)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [showCurrent, setShowCurrent] = useState(false)
    const [showNew, setShowNew] = useState(false)

    // Desde Perfil → Contraseña se llega con ?password=1
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('password') === '1') setPasswordOpen(true)
    }, [])

    // Load profile
    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data } = await supabase
                .from('profiles')
                .select('email, full_name')
                .eq('id', user.id)
                .single()

            if (data) {
                setProfile(data)
                setName(data.full_name || '')
            }
            setLoading(false)
        }
        loadProfile()
    }, [supabase, router])

    // Save name
    const handleSaveName = async () => {
        if (!name.trim()) {
            toast.error('El nombre no puede estar vacío')
            return
        }

        setSavingName(true)
        const result = await updateProfileNameAction(name)
        setSavingName(false)

        if (result.success) {
            setProfile((prev) => prev ? { ...prev, full_name: name.trim() } : prev)
            // El nombre del header/perfil viene de react-query: refrescarlo ya.
            void queryClient.invalidateQueries({ queryKey: ['client-context'] })
            toast.success('Nombre actualizado')
        } else {
            toast.error(result.error || 'No se pudo actualizar el nombre')
        }
    }

    // Change password
    const handleChangePassword = async () => {
        setPasswordError(null)

        // Validate
        if (newPassword.length < 8) {
            setPasswordError('La nueva contraseña debe tener al menos 8 caracteres')
            return
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('Las contraseñas no coinciden')
            return
        }

        setSavingPassword(true)

        // 1. Re-authenticate with current password
        const { error: reAuthError } = await supabase.auth.signInWithPassword({
            email: profile?.email || '',
            password: currentPassword,
        })

        if (reAuthError) {
            setPasswordError('Contraseña actual incorrecta')
            setSavingPassword(false)
            return
        }

        // 2. Update password
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword,
        })

        setSavingPassword(false)

        if (updateError) {
            setPasswordError(updateError.message)
            return
        }

        // Success
        toast.success('Contraseña actualizada')
        resetPasswordModal()
    }

    const resetPasswordModal = () => {
        setPasswordOpen(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordError(null)
        setShowCurrent(false)
        setShowNew(false)
    }

    const nameChanged = name.trim() !== (profile?.full_name || '').trim()

    const backButton = (
        <Link
            href="/profile"
            aria-label="Volver al perfil"
            className="-ml-1 mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card shadow-sm transition-colors hover:bg-muted"
        >
            <ChevronLeft className="h-5 w-5" />
        </Link>
    )

    if (loading) {
        return (
            <div className="app-mobile-page min-h-screen pb-6">
                <ClientPageHeader eyebrow="Perfil" title="Ajustes de cuenta" leading={backButton} />
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            </div>
        )
    }

    return (
        <div className="app-mobile-page min-h-screen pb-6">
            <ClientPageHeader eyebrow="Perfil" title="Ajustes de cuenta" leading={backButton} />

            <div className="mx-auto max-w-lg space-y-6 px-4 pt-5 animate-fade-in">
                <SettingsGroup title="Datos personales" footer="El email es tu usuario de acceso y no se puede cambiar desde aquí.">
                    <form
                        className="space-y-1.5 px-3.5 py-3"
                        onSubmit={(event) => { event.preventDefault(); if (nameChanged) handleSaveName() }}
                    >
                        <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground">Nombre</Label>
                        <div className="flex gap-2">
                            <Input
                                id="fullName"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Tu nombre completo"
                                disabled={savingName}
                                autoComplete="name"
                                className="h-10 rounded-xl"
                            />
                            {nameChanged && (
                                <Button type="submit" disabled={savingName || !name.trim()} className="h-10 shrink-0 rounded-xl px-4 animate-fade-in">
                                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                                </Button>
                            )}
                        </div>
                    </form>
                    <div className="space-y-1.5 px-3.5 py-3">
                        <p className="text-xs font-medium text-muted-foreground">Email</p>
                        <p className="truncate text-[15px] text-foreground">{profile?.email || '—'}</p>
                    </div>
                </SettingsGroup>

                <SettingsGroup title="Seguridad">
                    <SettingsRow
                        icon={KeyRound}
                        iconTone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        title="Cambiar contraseña"
                        description="Necesitarás tu contraseña actual"
                        onClick={() => setPasswordOpen(true)}
                    />
                </SettingsGroup>
            </div>

            {/* Password Modal */}
            <Dialog open={passwordOpen} onOpenChange={(v) => { if (!v) resetPasswordModal() }}>
                <DialogContent className="rounded-2xl sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Cambiar contraseña</DialogTitle>
                        <DialogDescription>
                            Introduce tu contraseña actual y la nueva contraseña.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={(e) => { e.preventDefault(); handleChangePassword() }}
                        className="space-y-4 py-2"
                    >
                        {/* Current password */}
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">Contraseña actual</Label>
                            <div className="relative">
                                <Input
                                    id="currentPassword"
                                    type={showCurrent ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    disabled={savingPassword}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                                >
                                    {showCurrent ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* New password */}
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nueva contraseña</Label>
                            <div className="relative">
                                <Input
                                    id="newPassword"
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Mín. 8 caracteres"
                                    required
                                    minLength={8}
                                    disabled={savingPassword}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew(!showNew)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                                >
                                    {showNew ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Confirm new password */}
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Repetir nueva contraseña</Label>
                            <Input
                                id="confirmPassword"
                                type={showNew ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repetir contraseña"
                                required
                                minLength={8}
                                disabled={savingPassword}
                            />
                        </div>

                        {/* Error */}
                        {passwordError && (
                            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {passwordError}
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={resetPasswordModal}
                                disabled={savingPassword}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={savingPassword}>
                                {savingPassword ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar contraseña'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
