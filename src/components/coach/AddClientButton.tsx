'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
    DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2, Send, Save, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { createClientAction } from './actions'
import { sendInviteAction } from './invite-actions'
import { useToast } from '@/hooks/use-toast'

interface AddClientButtonProps {
    coachId: string
}

export function AddClientButton({ coachId }: AddClientButtonProps) {
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter()
    const { toast } = useToast()

    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        start_date: new Date().toISOString().split('T')[0],
        checkin_frequency_days: 14,
        password: '',
        confirmPassword: '',
        payment_amount: '',
        payment_day: '',
        payment_notes: '',
    })

    const resetForm = () => {
        setFormData({
            full_name: '',
            email: '',
            phone: '',
            start_date: new Date().toISOString().split('T')[0],
            checkin_frequency_days: 14,
            password: '',
            confirmPassword: '',
            payment_amount: '',
            payment_day: '',
            payment_notes: '',
        })
        setError(null)
        setCopied(false)
        setShowPassword(false)
    }

    const validatePassword = (): string | null => {
        if (!formData.password) return null // password is optional
        if (formData.password.length < 8) {
            return 'La contraseña debe tener al menos 8 caracteres'
        }
        if (formData.password !== formData.confirmPassword) {
            return 'Las contraseñas no coinciden'
        }
        return null
    }

    const handleCopyPassword = async () => {
        if (!formData.password) return
        try {
            await navigator.clipboard.writeText(formData.password)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast({
                title: 'Error',
                description: 'No se pudo copiar la contraseña',
                variant: 'destructive',
            })
        }
    }

    const handleSubmit = (sendInvite: boolean) => {
        setError(null)

        // Validate password
        const pwError = validatePassword()
        if (pwError) {
            setError(pwError)
            return
        }

        startTransition(async () => {
            // 1. Create client (with password if provided)
            const result = await createClientAction({
                coach_id: coachId,
                full_name: formData.full_name,
                email: formData.email,
                phone: formData.phone || undefined,
                start_date: formData.start_date,
                checkin_frequency_days: formData.checkin_frequency_days,
                password: formData.password || undefined,
                payment_amount: formData.payment_amount ? parseFloat(formData.payment_amount) : undefined,
                payment_day: formData.payment_day ? parseInt(formData.payment_day) : undefined,
                payment_notes: formData.payment_notes || undefined,
            })

            if (!result.success || !result.client) {
                console.error('Error creating client:', {
                    error: result.error,
                    details: result.details,
                })
                const errorMessage = result.details
                    ? `${result.error}\n${result.details}`
                    : result.error || 'Error al crear el cliente'
                setError(errorMessage)
                return
            }

            // Show auth warning if any
            if ((result as any).authWarning) {
                toast({
                    title: 'Cliente creado con advertencia',
                    description: (result as any).authWarning,
                    variant: 'destructive',
                })
            }

            // 2. If password was set, show success with copy hint
            if (formData.password) {
                toast({
                    title: 'Cliente creado con contraseña ✓',
                    description: `${result.client.full_name} puede iniciar sesión con email + contraseña`,
                })
            } else if (sendInvite) {
                // 3. Send invite if requested (only when no password)
                const inviteResult = await sendInviteAction(result.client.id, coachId)

                if (inviteResult.success) {
                    toast({
                        title: 'Invitación enviada ✓',
                        description: `Invitación enviada a ${result.client.email}`,
                    })
                } else {
                    toast({
                        title: 'Cliente creado, pero la invitación falló',
                        description: inviteResult.error || 'No se pudo enviar la invitación',
                        variant: 'destructive',
                    })
                }
            } else {
                toast({
                    title: 'Cliente creado',
                    description: `${result.client.full_name} guardado sin invitación`,
                })
            }

            setOpen(false)
            resetForm()
            router.refresh()
        })
    }

    const hasPassword = formData.password.length > 0

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Añadir cliente</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nuevo cliente</DialogTitle>
                    <DialogDescription>
                        Crea un cliente y opcionalmente asígnale una contraseña inicial.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(!hasPassword) }} className="space-y-4 py-4">
                    {/* ---- Basic info ---- */}
                    <div className="space-y-2">
                        <Label htmlFor="full_name">Nombre completo *</Label>
                        <Input
                            id="full_name"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder="Juan Pérez"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="juan@ejemplo.com"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono</Label>
                        <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+34 600 000 000"
                            disabled={isPending}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start_date">Fecha inicio</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                required
                                disabled={isPending}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="frequency">Check-in (días)</Label>
                            <Input
                                id="frequency"
                                type="number"
                                min={7}
                                max={30}
                                value={formData.checkin_frequency_days}
                                onChange={(e) => setFormData({ ...formData, checkin_frequency_days: parseInt(e.target.value) || 14 })}
                                required
                                disabled={isPending}
                            />
                        </div>
                    </div>

                    {/* ---- Payment info ---- */}
                    <div className="border-t pt-4 mt-4 space-y-3">
                        <div>
                            <Label className="text-sm font-medium">💳 Información de pago</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Opcional — para tu control interno
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="payment_amount">Cuota mensual (€)</Label>
                                <Input
                                    id="payment_amount"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={formData.payment_amount}
                                    onChange={(e) => setFormData({ ...formData, payment_amount: e.target.value })}
                                    placeholder="150.00"
                                    disabled={isPending}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment_day">Día de cobro</Label>
                                <Input
                                    id="payment_day"
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={formData.payment_day}
                                    onChange={(e) => setFormData({ ...formData, payment_day: e.target.value })}
                                    placeholder="1"
                                    disabled={isPending}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payment_notes">Notas de pago</Label>
                            <Input
                                id="payment_notes"
                                value={formData.payment_notes}
                                onChange={(e) => setFormData({ ...formData, payment_notes: e.target.value })}
                                placeholder="Bizum, transferencia, efectivo..."
                                disabled={isPending}
                            />
                        </div>
                    </div>

                    {/* ---- Password section ---- */}
                    <div className="border-t pt-4 mt-4 space-y-3">
                        <div>
                            <Label className="text-sm font-medium">Contraseña inicial</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Opcional. Si la estableces, el cliente podrá iniciar sesión directamente sin invitación.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Mín. 8 caracteres"
                                    minLength={8}
                                    disabled={isPending}
                                    className="pr-20"
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                                    {formData.password && (
                                        <button
                                            type="button"
                                            onClick={handleCopyPassword}
                                            className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                            title="Copiar contraseña"
                                        >
                                            {copied ? (
                                                <Check className="h-3.5 w-3.5 text-green-500" />
                                            ) : (
                                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                                        title={showPassword ? 'Ocultar' : 'Mostrar'}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                        ) : (
                                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {formData.password && (
                            <div className="space-y-2">
                                <Input
                                    id="confirmPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    placeholder="Repetir contraseña"
                                    disabled={isPending}
                                />
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md whitespace-pre-wrap">
                            {error}
                        </div>
                    )}

                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        {hasPassword ? (
                            /* When password is set: single "Create with password" button */
                            <Button type="submit" disabled={isPending} className="w-full gap-2">
                                {isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Creando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        Crear con contraseña
                                    </>
                                )}
                            </Button>
                        ) : (
                            /* When no password: Save / Save + Invite buttons */
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleSubmit(false)}
                                    disabled={isPending}
                                    className="gap-2"
                                >
                                    <Save className="h-4 w-4" />
                                    Guardar sin invitación
                                </Button>
                                <Button type="submit" disabled={isPending} className="gap-2">
                                    {isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Creando...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4" />
                                            Guardar e invitar
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
