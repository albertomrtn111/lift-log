'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Palette, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { LogoMark } from '@/components/brand/LogoMark'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    NEXTRAIN_PRIMARY,
    REPORT_FOOTER_MAX,
    isHexColor,
    isReadablePrimary,
} from '@/lib/branding/branding-rules'
import { uploadMedia } from '@/lib/media-upload'
import {
    getBrandingAction,
    removeBrandingImageAction,
    saveBrandingAction,
    type BrandingData,
} from './branding-actions'

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg'

const IMAGE_SLOTS = [
    { slot: 'logo_light', label: 'Logo para fondo claro', hint: 'PNG o SVG, con fondo transparente', dark: false },
    { slot: 'logo_dark', label: 'Logo para fondo oscuro', hint: 'Opcional. Si no hay, se usa el otro', dark: true },
    { slot: 'icon', label: 'Icono', hint: 'Cuadrado, para la pestaña del navegador', dark: false },
] as const

export function BrandingSettingsPanel() {
    const router = useRouter()
    const [data, setData] = useState<BrandingData | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [displayName, setDisplayName] = useState('')
    const [primaryColor, setPrimaryColor] = useState('')
    const [accentColor, setAccentColor] = useState('')
    const [reportFooter, setReportFooter] = useState('')
    const [pending, startTransition] = useTransition()

    const load = useCallback(async () => {
        const result = await getBrandingAction()
        if (result.success && result.data) {
            setData(result.data)
            setLoadError(null)
            const branding = result.data.branding
            setDisplayName(branding?.display_name ?? '')
            setPrimaryColor(branding?.primary_color ?? '')
            setAccentColor(branding?.accent_color ?? '')
            setReportFooter(branding?.report_footer ?? '')
        } else {
            setLoadError(result.success ? 'No se pudo cargar el look & feel.' : result.error)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    if (loadError) return <Card className="p-5 text-sm text-muted-foreground">{loadError}</Card>

    if (!data) {
        return (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando el look & feel…
            </Card>
        )
    }

    if (!data.enabled) {
        return (
            <Card className="space-y-2 p-5">
                <div className="flex items-center gap-2 font-medium">
                    <Palette className="h-4 w-4 text-primary" />
                    Tu marca en NexTrain
                </div>
                <p className="text-sm text-muted-foreground">
                    El look & feel está incluido en el plan Studio. Con él, tu equipo y tus clientes ven tu logo y tus
                    colores.
                </p>
            </Card>
        )
    }

    const { canManage, branding } = data
    const hasPrimary = isHexColor(primaryColor)
    const unreadable = hasPrimary && !isReadablePrimary(primaryColor)
    const previewColor = hasPrimary && !unreadable ? primaryColor : NEXTRAIN_PRIMARY

    function save() {
        startTransition(async () => {
            const result = await saveBrandingAction({ displayName, primaryColor, accentColor, reportFooter })
            if (result.success) {
                toast.success('Look & feel guardado')
                await load()
                router.refresh()
            } else {
                toast.error(result.error)
            }
        })
    }

    return (
        <div className="space-y-4">
            <Card className="space-y-4 p-5">
                <div>
                    <h2 className="font-medium">Tu marca</h2>
                    <p className="text-sm text-muted-foreground">
                        Tu equipo y tus clientes verán tu nombre y tus colores en la app, y tu logo en los emails.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="branding-name">Nombre visible</Label>
                    <Input
                        id="branding-name"
                        value={displayName}
                        maxLength={80}
                        disabled={!canManage}
                        onChange={event => setDisplayName(event.target.value)}
                        placeholder="Ej: Centro Norte · Salud y Rendimiento"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField
                        id="branding-primary"
                        label="Color principal"
                        value={primaryColor}
                        disabled={!canManage}
                        onChange={setPrimaryColor}
                    />
                    <ColorField
                        id="branding-accent"
                        label="Color de acento"
                        hint="Se usará en los informes"
                        value={accentColor}
                        disabled={!canManage}
                        onChange={setAccentColor}
                    />
                </div>

                {unreadable && (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                        Este color no se lee bien sobre blanco. Si lo guardas, se usará el azul de NexTrain.
                    </p>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="branding-footer">Pie de informe</Label>
                    <Textarea
                        id="branding-footer"
                        value={reportFooter}
                        maxLength={REPORT_FOOTER_MAX}
                        disabled={!canManage}
                        onChange={event => setReportFooter(event.target.value)}
                        placeholder="Dirección, teléfono y web"
                        rows={2}
                    />
                </div>

                <div className="space-y-1.5">
                    <p className="text-sm font-medium">Vista previa</p>
                    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                        {branding?.logo_light_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={branding.logo_light_url} alt="" className="h-8 max-w-[96px] object-contain" />
                        ) : (
                            <LogoMark className="h-8 text-foreground" />
                        )}
                        <div className="min-w-0 flex-1 leading-none">
                            <p className="truncate text-sm font-bold">{displayName.trim() || 'NexTrain'}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">con NexTrain</p>
                        </div>
                        <span
                            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                            style={{ backgroundColor: previewColor }}
                        >
                            Botón
                        </span>
                    </div>
                </div>

                {canManage && (
                    <Button disabled={pending} onClick={save}>
                        {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Guardar
                    </Button>
                )}
            </Card>

            <Card className="divide-y divide-border">
                {IMAGE_SLOTS.map(item => (
                    <ImageRow
                        key={item.slot}
                        slot={item.slot}
                        label={item.label}
                        hint={item.hint}
                        dark={item.dark}
                        url={branding?.[`${item.slot}_url`] ?? null}
                        canManage={canManage}
                        onChanged={async () => {
                            await load()
                            router.refresh()
                        }}
                    />
                ))}
            </Card>
        </div>
    )
}

function ColorField({ id, label, hint, value, disabled, onChange }: {
    id: string
    label: string
    hint?: string
    value: string
    disabled: boolean
    onChange: (value: string) => void
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={`${label}: selector`}
                    value={isHexColor(value) ? value : NEXTRAIN_PRIMARY}
                    disabled={disabled}
                    onChange={event => onChange(event.target.value)}
                    className="h-10 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed"
                />
                <Input
                    id={id}
                    value={value}
                    maxLength={7}
                    disabled={disabled}
                    onChange={event => onChange(event.target.value)}
                    placeholder={NEXTRAIN_PRIMARY}
                />
            </div>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

function ImageRow({ slot, label, hint, dark, url, canManage, onChanged }: {
    slot: string
    label: string
    hint: string
    dark: boolean
    url: string | null
    canManage: boolean
    onChanged: () => Promise<void>
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)

    async function upload(file: File) {
        setBusy(true)
        const { error } = await uploadMedia<{ url: string }>({ kind: 'branding', slot }, file, file.name)
        if (error) toast.error(error)
        else await onChanged()
        setBusy(false)
    }

    async function remove() {
        setBusy(true)
        const result = await removeBrandingImageAction(slot)
        if (result.success) await onChanged()
        else toast.error(result.error)
        setBusy(false)
    }

    return (
        <div className="flex items-center gap-3 p-4">
            <div className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md border ${dark ? 'bg-slate-900' : 'bg-white'}`}>
                {url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="max-h-10 max-w-14 object-contain" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                    <input
                        ref={inputRef}
                        type="file"
                        accept={IMAGE_ACCEPT}
                        className="hidden"
                        onChange={event => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) void upload(file)
                        }}
                    />
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        disabled={busy}
                        aria-label={`Subir ${label}`}
                        onClick={() => inputRef.current?.click()}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    {url && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            disabled={busy}
                            aria-label={`Quitar ${label}`}
                            onClick={() => void remove()}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
