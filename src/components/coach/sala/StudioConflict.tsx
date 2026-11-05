'use client'

import { Button } from '@/components/ui/button'

/** Otro profesional ha cambiado lo que tienes abierto: se ven los dos valores y eliges. */
export function StudioConflict({ title, rows, disabled, onKeepMine, onUseTheirs }: {
    title: string
    rows: { label: string; mine: string; theirs: string }[]
    disabled: boolean
    onKeepMine: () => void
    onUseTheirs: () => void
}) {
    return (
        <div role="alert" className="space-y-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-sm">
            <p className="font-semibold">{title}</p>
            {rows.length > 0 && (
                <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">
                    <span />
                    <span className="text-xs text-muted-foreground">Lo tuyo</span>
                    <span className="text-xs text-muted-foreground">Lo suyo</span>
                    {rows.map(row => (
                        <div key={row.label} className="contents">
                            <dt className="text-muted-foreground">{row.label}</dt>
                            <dd className="break-words">{row.mine}</dd>
                            <dd className="break-words font-medium">{row.theirs}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="flex-1" disabled={disabled} onClick={onKeepMine}>
                    Guardar lo mío
                </Button>
                <Button type="button" size="sm" className="flex-1" disabled={disabled} onClick={onUseTheirs}>
                    Usar lo suyo
                </Button>
            </div>
        </div>
    )
}
