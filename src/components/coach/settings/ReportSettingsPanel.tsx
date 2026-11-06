'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
    getReportSettingsAction,
    saveReportSettingsAction,
    type ReportSettings,
} from '@/components/coach/settings/report-settings-actions'
import { DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_TEXT, DEFAULT_WHATSAPP_TEXT, REPORT_SECTIONS } from '@/lib/studio/report-rules'

/** Cómo salen los informes de esta sala. */
export function ReportSettingsPanel() {
    const [settings, setSettings] = useState<ReportSettings | null>(null)
    const [isPending, startTransition] = useTransition()

    useEffect(() => { void getReportSettingsAction().then(setSettings) }, [])

    if (!settings) {
        return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
    }

    const change = (patch: Partial<ReportSettings>) => setSettings({ ...settings, ...patch })

    function save() {
        startTransition(async () => {
            const result = await saveReportSettingsAction(settings!)
            if (result.success) toast.success('Guardado')
            else toast.error(result.error)
        })
    }

    return (
        <div className="space-y-4">
            <Card className="space-y-3 p-4">
                <div>
                    <h2 className="font-semibold">Mensajes</h2>
                    <p className="text-sm text-muted-foreground">Vacíos, salen los de NexTrain. Puedes usar {'{nombre}'}, {'{centro}'} y, en WhatsApp, {'{enlace}'}.</p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="informe-whatsapp">WhatsApp</Label>
                    <Textarea id="informe-whatsapp" rows={3} maxLength={1000} value={settings.whatsappText} placeholder={DEFAULT_WHATSAPP_TEXT} onChange={event => change({ whatsappText: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="informe-asunto">Asunto del email</Label>
                    <Input id="informe-asunto" maxLength={150} value={settings.emailSubject} placeholder={DEFAULT_EMAIL_SUBJECT} onChange={event => change({ emailSubject: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="informe-email">Texto del email</Label>
                    <Textarea id="informe-email" rows={3} maxLength={2000} value={settings.emailText} placeholder={DEFAULT_EMAIL_TEXT} onChange={event => change({ emailText: event.target.value })} />
                </div>
            </Card>

            <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Avisos</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="informe-canal">Canal habitual</Label>
                        <Select value={settings.defaultChannel} onValueChange={value => change({ defaultChannel: value as ReportSettings['defaultChannel'] })}>
                            <SelectTrigger id="informe-canal"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="informe-horas">Horas que dura el aviso</Label>
                        <Input
                            id="informe-horas"
                            type="number"
                            min={1}
                            max={48}
                            value={settings.noticeHours}
                            onChange={event => change({ noticeHours: Number(event.target.value) })}
                        />
                    </div>
                </div>
            </Card>

            <Card className="divide-y">
                <div className="p-4">
                    <h2 className="font-semibold">Qué sale en el informe</h2>
                    <p className="text-sm text-muted-foreground">Se aplica a los informes que crees a partir de ahora.</p>
                </div>
                {REPORT_SECTIONS.map(section => (
                    <div key={section.key} className="flex items-center justify-between gap-4 p-4">
                        <Label htmlFor={`informe-${section.key}`} className="font-normal">{section.label}</Label>
                        <Switch
                            id={`informe-${section.key}`}
                            checked={settings.sections[section.key]}
                            onCheckedChange={on => change({ sections: { ...settings.sections, [section.key]: on } })}
                        />
                    </div>
                ))}
            </Card>

            <Button disabled={isPending} onClick={save}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
            </Button>
        </div>
    )
}
