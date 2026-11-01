'use client'

import { Fragment, useCallback, useEffect, useState, type ElementType, type ReactNode } from 'react'
import {
    Activity,
    Apple,
    Bot,
    CalendarRange,
    Check,
    ClipboardCheck,
    Copy,
    Dumbbell,
    EyeOff,
    Inbox,
    KeyRound,
    Loader2,
    LogIn,
    Plug,
    ShieldCheck,
    Unplug,
    Users,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/sonner'
import {
    listMcpConnectionsAction,
    revokeMcpConnectionAction,
    type McpConnection,
} from './mcp-settings-actions'

const SERVER_NAME = 'nextrain'

const TAB_TRIGGER_CLASS = 'rounded-lg px-3 py-2 sm:py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'

const CAPABILITIES: Array<{ icon: ElementType; title: string; text: string }> = [
    {
        icon: Users,
        title: 'Conocer a tus atletas',
        text: 'Check-ins, peso, sueño y pasos, resultados de fuerza y cardio, y actividades de Strava.',
    },
    {
        icon: Dumbbell,
        title: 'Preparar programas de fuerza',
        text: 'Crea bloques con ejercicios de tu biblioteca. Se crean en borrador y solo se activan si tú lo pides.',
    },
    {
        icon: Apple,
        title: 'Ajustar la nutrición',
        text: 'Macros de entreno y descanso, y dietas por opciones con alimentos y cantidades.',
    },
    {
        icon: Activity,
        title: 'Programar cardio',
        text: 'Añade o edita sesiones rápidas o estructuradas por bloques y zonas.',
    },
    {
        icon: CalendarRange,
        title: 'Planificar la temporada',
        text: 'Objetivos, carreras y eventos, y planes de temporada por fases y semanas.',
    },
    {
        icon: Inbox,
        title: 'Organizar tu día',
        text: 'Tu bandeja de pendientes, tareas de seguimiento y borradores de revisión.',
    },
]

const EXAMPLE_PROMPTS = [
    '¿Qué tengo pendiente hoy en NexTrain?',
    'Hazme un resumen de la semana de Laura: check-in, peso, entrenos y sueño.',
    'Revisa el último check-in de Laura y déjame un borrador de respuesta.',
    'Prepara el siguiente bloque de fuerza de Laura (4 semanas) a partir de sus últimos resultados y guárdalo en borrador.',
    'Baja 150 kcal los días de descanso de Laura manteniendo la proteína.',
    'Programa a Laura un rodaje de 45 minutos en zona 2 para el jueves.',
]

interface McpSettingsPanelProps {
    serverUrl: string | null
}

export function McpSettingsPanel({ serverUrl }: McpSettingsPanelProps) {
    const url = serverUrl ?? ''
    const claudeCodeCommand = `claude mcp add --transport http --scope user ${SERVER_NAME} ${url}`

    return (
        <div className="space-y-6">
            <Card className="subtle-panel">
                <CardHeader className="space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <CardTitle className="text-xl">Asistente de IA (MCP)</CardTitle>
                            <CardDescription className="mt-1 leading-6">
                                Conecta Claude, ChatGPT u otro asistente a tu cuenta de NexTrain. Podrás pedirle en lenguaje normal que revise a tus atletas o te prepare programas, dietas y sesiones.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Step number={1} title="Copia la dirección del servidor">
                        <p className="text-sm leading-6 text-muted-foreground">
                            Es la misma para todos los entrenadores: cada uno entra después con su propia cuenta. No necesitas claves ni contraseñas especiales.
                        </p>
                        {serverUrl ? (
                            <CopyField value={serverUrl} label="Dirección del servidor MCP" copiedMessage="Dirección copiada" />
                        ) : (
                            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                                La dirección del servidor no está configurada en este entorno.
                            </p>
                        )}
                    </Step>

                    <Step number={2} title="Añádela en tu asistente">
                        <Tabs defaultValue="claude" className="w-full">
                            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl p-1 sm:inline-flex sm:w-auto">
                                <TabsTrigger value="claude" className={TAB_TRIGGER_CLASS}>Claude</TabsTrigger>
                                <TabsTrigger value="claude-code" className={TAB_TRIGGER_CLASS}>Claude Code</TabsTrigger>
                                <TabsTrigger value="chatgpt" className={TAB_TRIGGER_CLASS}>ChatGPT</TabsTrigger>
                                <TabsTrigger value="otros" className={TAB_TRIGGER_CLASS}>Otros</TabsTrigger>
                            </TabsList>

                            <TabsContent value="claude" className="mt-4 space-y-4">
                                <p className="text-sm text-muted-foreground">Para claude.ai y la app de escritorio de Claude.</p>
                                <StepList>
                                    <li>Abre <ExternalLink href="https://claude.ai">claude.ai</ExternalLink> o la app de escritorio e inicia sesión.</li>
                                    <li>Ve a <Menu>Customize</Menu> › <Menu>Connectors</Menu>.</li>
                                    <li>Pulsa <Menu>+ Add</Menu> y elige <Menu>Add custom connector</Menu>.</li>
                                    <li>Escribe <Strong>NexTrain</Strong> como nombre, pega la dirección del paso 1 y pulsa <Menu>Continue</Menu>.</li>
                                    <li>Deja la autenticación que Claude detecta (inicio de sesión con OAuth) y pulsa <Menu>Add</Menu>.</li>
                                    <li>Se abrirá NexTrain: inicia sesión y pulsa <Strong>Autorizar conexión</Strong>.</li>
                                    <li>En cualquier chat, pulsa <Menu>+</Menu> › <Menu>Connectors</Menu> y comprueba que NexTrain está activado.</li>
                                </StepList>
                                <Note>
                                    Si usas Claude en español, verás los mismos menús traducidos. En el plan gratuito solo se puede añadir un conector personalizado. En planes Team o Enterprise, el propietario de la organización lo añade en <Menu>Organization settings</Menu> › <Menu>Connectors</Menu> y luego cada miembro pulsa <Menu>Connect</Menu>.
                                </Note>
                            </TabsContent>

                            <TabsContent value="claude-code" className="mt-4 space-y-4">
                                <p className="text-sm text-muted-foreground">Para quien usa Claude Code en el terminal.</p>
                                <StepList>
                                    <li>
                                        Ejecuta este comando en el terminal:
                                        {serverUrl && (
                                            <div className="mt-2">
                                                <CopyField value={claudeCodeCommand} label="Comando para Claude Code" copiedMessage="Comando copiado" />
                                            </div>
                                        )}
                                    </li>
                                    <li>Abre Claude Code, escribe <Code>/mcp</Code>, elige <Code>{SERVER_NAME}</Code> y sigue los pasos para autenticarte. También puedes ejecutar <Code>claude mcp login {SERVER_NAME}</Code>.</li>
                                    <li>Se abrirá NexTrain en el navegador: inicia sesión y pulsa <Strong>Autorizar conexión</Strong>.</li>
                                    <li>Vuelve a <Code>/mcp</Code>: NexTrain debe aparecer como conectado.</li>
                                </StepList>
                                <Note>
                                    <Code>--scope user</Code> deja NexTrain disponible en todos tus proyectos. Para cerrar la sesión: <Code>claude mcp logout {SERVER_NAME}</Code>.
                                </Note>
                            </TabsContent>

                            <TabsContent value="chatgpt" className="mt-4 space-y-4">
                                <p className="text-sm text-muted-foreground">Desde chatgpt.com en el navegador.</p>
                                <StepList>
                                    <li>Abre <ExternalLink href="https://chatgpt.com/plugins">chatgpt.com/plugins</ExternalLink>.</li>
                                    <li>Pulsa <Menu>+</Menu> y elige <Menu>Add custom MCP server</Menu>.</li>
                                    <li>Escribe <Strong>NexTrain</Strong> como nombre y, en <Menu>Connection</Menu>, pega la dirección del paso 1 en <Menu>Server URL</Menu>.</li>
                                    <li>En autenticación, elige <Menu>OAuth</Menu>.</li>
                                    <li>Lee el aviso, pulsa <Menu>I understand and want to continue</Menu> y después <Menu>Create as a plugin</Menu>.</li>
                                    <li>Instala el plugin. Cuando se abra NexTrain, inicia sesión y pulsa <Strong>Autorizar conexión</Strong>.</li>
                                    <li>En un chat nuevo, escribe <Code>@</Code> y elige NexTrain.</li>
                                </StepList>
                                <Note>
                                    Depende de tu plan de ChatGPT y, en cuentas de empresa, de que el administrador lo permita. Si no ves la opción, usa Claude. ChatGPT te pedirá confirmación antes de cada acción que cambie datos.
                                </Note>
                            </TabsContent>

                            <TabsContent value="otros" className="mt-4 space-y-4">
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Funciona con cualquier asistente o editor compatible con <Strong>servidores MCP remotos</Strong> (HTTP con inicio de sesión OAuth).
                                </p>
                                <StepList>
                                    <li>Busca en sus ajustes la opción de añadir un servidor MCP o conector remoto.</li>
                                    <li>Elige el tipo <Strong>HTTP</Strong> (a veces llamado «Streamable HTTP») y pega la dirección del paso 1.</li>
                                    <li>No añadas claves ni cabeceras: el asistente abrirá el inicio de sesión de NexTrain por su cuenta.</li>
                                    <li>Inicia sesión y pulsa <Strong>Autorizar conexión</Strong>.</li>
                                </StepList>
                            </TabsContent>
                        </Tabs>
                    </Step>

                    <Step number={3} title="Inicia sesión y autoriza">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <FlowItem icon={LogIn} title="Entra en NexTrain" text="Se abre la página de inicio de sesión de NexTrain. Usa tu cuenta de entrenador." />
                            <FlowItem icon={ShieldCheck} title="Revisa los permisos" text="Verás qué asistente pide acceso y qué podrá hacer." />
                            <FlowItem icon={Check} title="Autoriza la conexión" text="Pulsa «Autorizar conexión» y vuelve a tu asistente. Ya está listo." />
                        </div>
                    </Step>
                </CardContent>
            </Card>

            <Card className="subtle-panel">
                <CardHeader>
                    <CardTitle className="text-lg">Qué puede hacer la IA</CardTitle>
                    <CardDescription>Trabaja con tus datos de NexTrain igual que lo harías tú desde la app.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {CAPABILITIES.map(({ icon: Icon, title, text }) => (
                            <div key={title} className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-4">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">{title}</p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <SafetyItem icon={KeyRound} title="Con tu propia cuenta" text="Entra con OAuth: no compartes tu contraseña ni ninguna clave." />
                        <SafetyItem icon={EyeOff} title="Solo tus atletas" text="Respeta las mismas reglas de acceso que la app. Nunca ve datos de otros entrenadores." />
                        <SafetyItem icon={Unplug} title="Tú decides" text="No envía mensajes a tus atletas ni publica revisiones, y puedes desconectarla cuando quieras." />
                    </div>
                </CardContent>
            </Card>

            <Card className="subtle-panel">
                <CardHeader>
                    <CardTitle className="text-lg">Pruébalo nada más conectarlo</CardTitle>
                    <CardDescription>Copia una petición, cambia el nombre por el de uno de tus atletas y pégala en el chat.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="grid gap-2">
                        {EXAMPLE_PROMPTS.map((prompt) => (
                            <li key={prompt}>
                                <ExamplePrompt prompt={prompt} />
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            <ConnectedAssistantsCard />
        </div>
    )
}

function ConnectedAssistantsCard() {
    const [connections, setConnections] = useState<McpConnection[] | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [pendingRevoke, setPendingRevoke] = useState<McpConnection | null>(null)
    const [revoking, setRevoking] = useState(false)

    const load = useCallback(async () => {
        const result = await listMcpConnectionsAction()
        if (result.success) {
            setConnections(result.connections ?? [])
            setLoadError(null)
        } else {
            setLoadError(result.error ?? 'No se pudieron cargar los asistentes conectados')
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const handleRevoke = async () => {
        if (!pendingRevoke) return
        setRevoking(true)
        const result = await revokeMcpConnectionAction(pendingRevoke.clientId)
        setRevoking(false)
        if (result.success) {
            toast.success(`${pendingRevoke.name} desconectado`)
            setConnections((current) => current?.filter((c) => c.clientId !== pendingRevoke.clientId) ?? null)
            setPendingRevoke(null)
        } else {
            toast.error(result.error ?? 'No se pudo desconectar el asistente')
        }
    }

    return (
        <Card id="asistentes-conectados" className="subtle-panel">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Asistentes conectados</CardTitle>
                </div>
                <CardDescription>
                    Los asistentes que has autorizado con tu cuenta. Al desconectar uno, pierde el acceso al momento; para volver a usarlo, conéctalo de nuevo desde el asistente.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loadError ? (
                    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>{loadError}</span>
                        <Button variant="outline" size="sm" onClick={() => void load()}>Reintentar</Button>
                    </div>
                ) : connections === null ? (
                    <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando…
                    </div>
                ) : connections.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm leading-6 text-muted-foreground">
                        Todavía no has conectado ningún asistente. Cuando autorices uno, aparecerá aquí.
                    </p>
                ) : (
                    <ul className="divide-y divide-border/70 rounded-2xl border border-border/70">
                        {connections.map((connection) => (
                            <li key={connection.clientId} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-foreground">{connection.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Autorizado el {new Date(connection.grantedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 text-destructive hover:text-destructive"
                                    onClick={() => setPendingRevoke(connection)}
                                >
                                    Desconectar
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>

            <AlertDialog open={pendingRevoke !== null} onOpenChange={(open) => !open && !revoking && setPendingRevoke(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Desconectar {pendingRevoke?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Dejará de poder consultar y modificar tus datos de NexTrain. Lo que ya haya creado se mantiene. Puedes volver a conectarlo cuando quieras.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={revoking}
                            onClick={(event) => {
                                event.preventDefault()
                                void handleRevoke()
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
                            Desconectar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}

function useCopy(value: string, message: string) {
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        try {
            await writeToClipboard(value)
            setCopied(true)
            toast.success(message)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.')
        }
    }

    return { copied, copy }
}

// Algunos navegadores integrados y PWAs bloquean la API del portapapeles: se recurre a execCommand
async function writeToClipboard(value: string) {
    try {
        await navigator.clipboard.writeText(value)
        return
    } catch {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const ok = document.execCommand('copy')
        textarea.remove()
        if (!ok) throw new Error('copy failed')
    }
}

function CopyField({ value, label, copiedMessage }: { value: string; label: string; copiedMessage: string }) {
    const { copied, copy } = useCopy(value, copiedMessage)

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/40 p-2 sm:flex-row sm:items-center">
            <code aria-label={label} className="min-w-0 flex-1 select-all break-words px-2 py-1 font-mono text-xs leading-5 text-foreground sm:text-[13px]">
                {withLineBreaks(value)}
            </code>
            <Button type="button" size="sm" onClick={() => void copy()} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar'}
            </Button>
        </div>
    )
}

// Permite partir la URL por las barras en pantallas estrechas en lugar de a mitad de palabra
function withLineBreaks(value: string) {
    return value.split('/').map((part, index, parts) => (
        <Fragment key={index}>
            {part}
            {index < parts.length - 1 && (part.endsWith(':') ? '/' : <>/<wbr /></>)}
        </Fragment>
    ))
}

function ExamplePrompt({ prompt }: { prompt: string }) {
    const { copied, copy } = useCopy(prompt, 'Petición copiada')

    return (
        <button
            type="button"
            onClick={() => void copy()}
            className="group flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-left text-sm leading-6 text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
            <span className="min-w-0 flex-1">«{prompt}»</span>
            <span className="mt-1 shrink-0 text-muted-foreground group-hover:text-primary" aria-label="Copiar">
                {copied ? <ClipboardCheck className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </span>
        </button>
    )
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {number}
                </span>
                <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
            </div>
            <div className="space-y-3 sm:pl-8">{children}</div>
        </section>
    )
}

function StepList({ children }: { children: ReactNode }) {
    return (
        <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-6 text-foreground marker:font-semibold marker:text-primary">
            {children}
        </ol>
    )
}

function FlowItem({ icon: Icon, title, text }: { icon: ElementType; title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
        </div>
    )
}

function SafetyItem({ icon: Icon, title, text }: { icon: ElementType; title: string; text: string }) {
    return (
        <div className="rounded-2xl bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-100">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">{title}</p>
            </div>
            <p className="mt-1.5 text-xs leading-5 opacity-90">{text}</p>
        </div>
    )
}

function Note({ children }: { children: ReactNode }) {
    return (
        <p className="rounded-xl border border-border/70 bg-secondary/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
            {children}
        </p>
    )
}

function Strong({ children }: { children: ReactNode }) {
    return <span className="font-semibold text-foreground">{children}</span>
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">
            {children}
        </a>
    )
}

function Menu({ children }: { children: ReactNode }) {
    return (
        <span className="whitespace-nowrap rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[0.9em] font-medium text-foreground">
            {children}
        </span>
    )
}

function Code({ children }: { children: ReactNode }) {
    return <code className="break-words rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>
}
