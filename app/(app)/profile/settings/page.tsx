'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { updateProfileNameAction } from '../actions'
import { Card } from '@/components/ui/card'
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
import {
    ArrowLeft,
    Settings,
    Mail,
    User,
    Lock,
    Loader2,
    Eye,
    EyeOff,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ProfileData {
    email: string
    full_name: string
}

export default function ProfileSettingsPage() {
    const router = useRouter()
    const { toast } = useToast()
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
            toast({ title: 'Error', description: 'El nombre no puede estar vacío', variant: 'destructive' })
            return
        }

        setSavingName(true)
        const result = await updateProfileNameAction(name)
        setSavingName(false)

        if (result.success) {
            setProfile((prev) => prev ? { ...prev, full_name: name.trim() } : prev)
            toast({ title: 'Nombre actualizado ✓', description: 'Tu nombre ha sido guardado correctamente.' })
        } else {
            toast({ title: 'Error', description: result.error || 'No se pudo actualizar el nombre', variant: 'destructive' })
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
        toast({ title: 'Contraseña actualizada ✓', description: 'Tu contraseña ha sido cambiada correctamente.' })
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

    // Loading
    if (loading) {
        return (
            <div className="app-mobile-page min-h-screen pb-4">
                <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                    <div className="px-4 py-4 flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => router.back()}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-lg font-bold">Configuración</h1>
                            <p className="text-sm text-muted-foreground">Ajustes de tu perfil</p>
                        </div>
                    </div>
                </header>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            </div>
        )
    }

    return (
        <div className="app-mobile-page min-h-screen pb-4">
            {/* Header */}
            <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4 flex items-center gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/profile">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        <div>
                            <h1 className="text-lg font-bold">Configuración</h1>
                            <p className="text-sm text-muted-foreground">Ajustes de tu perfil</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
                {/* Email (read only) */}
                <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        Email
                    </div>
                    <Input
                        value={profile?.email || ''}
                        disabled
                        className="bg-muted/50"
                    />
                    <p className="text-xs text-muted-foreground">
                        El email no se puede cambiar desde aquí.
                    </p>
                </Card>

                {/* Name */}
                <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <User className="h-4 w-4" />
                        Nombre
                    </div>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tu nombre completo"
                        disabled={savingName}
                    />
                    <Button
                        onClick={handleSaveName}
                        disabled={savingName || !nameChanged || !name.trim()}
                        className="w-full"
                    >
                        {savingName ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar nombre'
                        )}
                    </Button>
                </Card>

                {/* Password */}
                <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Lock className="h-4 w-4" />
                        Contraseña
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Cambia tu contraseña para mantener tu cuenta segura.
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => setPasswordOpen(true)}
                        className="w-full"
                    >
                        Cambiar contraseña
                    </Button>
                </Card>
            </div>

            {/* Password Modal */}
            <Dialog open={passwordOpen} onOpenChange={(v) => { if (!v) resetPasswordModal() }}>
                <DialogContent className="sm:max-w-[400px]">
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
