'use client'

import { forwardRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Campo con etiqueta y, opcionalmente, un enlace a la derecha */
export function AuthField({ id, label, aside, hint, children }: {
    id: string
    label: string
    aside?: React.ReactNode
    hint?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
                {aside && <div className="text-[13px]">{aside}</div>}
            </div>
            {children}
            {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
    )
}

export const AuthInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
    ({ className, ...props }, ref) => (
        <Input ref={ref} className={cn('h-11 rounded-xl px-3.5 text-[15px] md:text-[15px]', className)} {...props} />
    ),
)
AuthInput.displayName = 'AuthInput'

export const PasswordInput = forwardRef<HTMLInputElement, Omit<React.ComponentProps<typeof Input>, 'type'>>(
    ({ className, ...props }, ref) => {
        const [visible, setVisible] = useState(false)
        return (
            <div className="relative">
                <AuthInput ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
                <button
                    type="button"
                    onClick={() => setVisible(v => !v)}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    tabIndex={-1}
                >
                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        )
    },
)
PasswordInput.displayName = 'PasswordInput'

/** Barra de fortaleza sencilla: longitud, mayúsculas/números y símbolos */
export function PasswordStrength({ value }: { value: string }) {
    if (!value) return null
    let score = 0
    if (value.length >= 6) score++
    if (value.length >= 10) score++
    if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) score++
    if (/[^A-Za-z0-9]/.test(value)) score++
    const level = value.length < 6 ? 0 : Math.min(3, Math.max(1, score))
    const labels = ['Demasiado corta', 'Aceptable', 'Buena', 'Muy segura']
    const colors = ['bg-destructive', 'bg-warning', 'bg-success', 'bg-success']
    return (
        <div className="flex items-center gap-2.5">
            <div className="grid flex-1 grid-cols-3 gap-1">
                {[1, 2, 3].map(step => (
                    <span key={step} className={cn('h-1 rounded-full transition-colors', level >= step || (level === 0 && step === 1) ? colors[level] : 'bg-muted')} />
                ))}
            </div>
            <span className={cn('w-24 text-right text-[11px] font-medium', level === 0 ? 'text-destructive' : 'text-muted-foreground')}>{labels[level]}</span>
        </div>
    )
}

export function AuthAlert({ tone = 'error', title, children }: {
    tone?: 'error' | 'warning' | 'success' | 'info'
    title?: React.ReactNode
    children?: React.ReactNode
}) {
    const styles = {
        error: { box: 'border-destructive/25 bg-destructive/[0.06]', icon: AlertCircle, iconClass: 'text-destructive' },
        warning: { box: 'border-warning/40 bg-warning/[0.08]', icon: AlertCircle, iconClass: 'text-amber-600 dark:text-warning' },
        success: { box: 'border-success/25 bg-success/[0.06]', icon: CheckCircle2, iconClass: 'text-success' },
        info: { box: 'border-primary/20 bg-primary/[0.05]', icon: Info, iconClass: 'text-primary' },
    }[tone]
    const Icon = styles.icon
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-3.5 py-3 text-sm', styles.box)}>
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', styles.iconClass)} />
            <div className="min-w-0 space-y-1">
                {title && <p className="font-semibold text-foreground">{title}</p>}
                {children && <div className="text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline">{children}</div>}
            </div>
        </div>
    )
}
