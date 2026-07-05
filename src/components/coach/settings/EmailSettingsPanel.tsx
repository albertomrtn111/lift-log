'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Mail, Send, ShieldCheck, Trash2, Info } from 'lucide-react'
import {
    getEmailSettingsAction,
    saveEmailSettingsAction,
    sendTestEmailAction,
    deleteEmailSettingsAction,
} from './email-settings-actions'

const PRESETS: Record<string, { label: string; host: string; port: number; help: string }> = {
    gmail: {
        label: 'Gmail / Google Workspace',
        host: 'smtp.gmail.com',
        port: 465,
        help: 'Necesitas una "contraseña de aplicación": Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación.',
    },
    outlook: {
        label: 'Outlook / Microsoft 365',
        host: 'smtp.office365.com',
        port: 587,
        help: 'Usa tu email y contraseña de Microsoft. Si tienes 2FA, crea una contraseña de aplicación.',
    },
    custom: {
        label: 'Otro (SMTP manual)',
        host: '',
        port: 465,
        help: 'Introduce los datos SMTP que te dé tu proveedor de email o hosting.',
    },
}

export function EmailSettingsPanel() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [configured, setConfigured] = useState(false)
    const [verifiedAt, setVerifiedAt] = useState<string | null>(null)
    const [hasPassword, setHasPassword] = useState(false)

    const [preset, setPreset] = useState<string>('gmail')
    const [host, setHost] = useState('smtp.gmail.com')
    const [port, setPort] = useState<number>(465)
    const [user, setUser] = useState('')
    const [pass, setPass] = useState('')
    const [fromName, setFromName] = useState('')

    useEffect(() => {
        getEmailSettingsAction()
            .then((settings) => {
                if (!settings) return
                setConfigured(settings.configured)
                setVerifiedAt(settings.last_verified_at)
                setHasPassword(settings.has_password)
                if (settings.configured) {
                    setHost(settings.smtp_host ?? '')
                    setPort(settings.smtp_port ?? 465)
                    setUser(settings.smtp_user ?? '')
                    setFromName(settings.from_name ?? '')
                    const matched = Object.entries(PRESETS).find(
                        ([, p]) => p.host === settings.smtp_host
                    )
                    setPreset(matched ? matched[0] : 'custom')
                }
            })
            .finally(() => setLoading(false))
    }, [])

    const applyPreset = (key: string) => {
        setPreset(key)
        const p = PRESETS[key]
        if (p && key !== 'custom') {
            setHost(p.host)
            setPort(p.port)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const result = await saveEmailSettingsAction({
                smtp_host: host,
                smtp_port: port,
                smtp_user: user,
                smtp_pass: pass || undefined,
                from_name: fromName || undefined,
                from_email: user || undefined,
            })
            if (result.success) {
                toast.success('Configuración guardada y conexión verificada ✅')
                setConfigured(true)
                setHasPassword(true)
                setPass('')
                setVerifiedAt(new Date().toISOString())
            } else {
                toast.error(result.error ?? 'Error al guardar')
            }
        } finally {
            setSaving(false)
        }
    }

    const handleTest = async () => {
        setTesting(true)
        try {
            const result = await sendTestEmailAction()
            if (result.success) {
                toast.success('Email de prueba enviado — revisa tu bandeja de entrada')
                setVerifiedAt(new Date().toISOString())
            } else {
                toast.error(result.error ?? 'Error en el envío de prueba')
            }
        } finally {
            setTesting(false)
        }
    }

    const handleDelete = async () => {
        const result = await deleteEmailSettingsAction()
        if (result.success) {
            toast.success('Configuración eliminada — los emails volverán a salir desde la cuenta general de la app')
            setConfigured(false)
            setHasPassword(false)
            setUser('')
            setPass('')
            setFromName('')
            setVerifiedAt(null)
        } else {
            toast.error(result.error ?? 'Error al eliminar')
        }
    }

    if (loading) {
        return (
            <Card className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <Card className="p-6 space-y-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-base font-semibold">Email de envío</h3>
                            {configured ? (
                                verifiedAt ? (
                                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 border-0">
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                        Verificado
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">Sin verificar</Badge>
                                )
                            ) : (
                                <Badge variant="secondary">No configurado</Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground max-w-lg">
                            Las revisiones, invitaciones y formularios de onboarding se enviarán a tus
                            atletas <strong>desde tu propia dirección</strong>. Si no configuras nada,
                            salen desde la cuenta general de la app.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                        <Label>Proveedor</Label>
                        <Select value={preset} onValueChange={applyPreset}>
                            <SelectTrigger className="w-full sm:w-72">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(PRESETS).map(([key, p]) => (
                                    <SelectItem key={key} value={key}>
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            {PRESETS[preset]?.help}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="smtp-host">Servidor SMTP</Label>
                        <Input
                            id="smtp-host"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            placeholder="smtp.gmail.com"
                            disabled={preset !== 'custom'}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtp-port">Puerto</Label>
                        <Input
                            id="smtp-port"
                            type="number"
                            value={port}
                            onChange={(e) => setPort(Number(e.target.value))}
                            disabled={preset !== 'custom'}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtp-user">Tu email</Label>
                        <Input
                            id="smtp-user"
                            type="email"
                            value={user}
                            onChange={(e) => setUser(e.target.value)}
                            placeholder="entrenador@gmail.com"
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtp-pass">Contraseña</Label>
                        <Input
                            id="smtp-pass"
                            type="password"
                            value={pass}
                            onChange={(e) => setPass(e.target.value)}
                            placeholder={hasPassword ? '•••••••• (guardada — deja vacío para no cambiarla)' : 'Contraseña de aplicación'}
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="from-name">Nombre visible (remitente)</Label>
                        <Input
                            id="from-name"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            placeholder="P. ej. Alberto — NextTrain"
                            className="sm:w-72"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                    <Button onClick={handleSave} disabled={saving || !host || !user}>
                        {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
                        Guardar y verificar
                    </Button>
                    <Button variant="outline" onClick={handleTest} disabled={testing || !configured}>
                        {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                        Enviarme un email de prueba
                    </Button>
                    {configured && (
                        <Button variant="ghost" onClick={handleDelete} className="text-destructive hover:text-destructive ml-auto">
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            Eliminar configuración
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    )
}
