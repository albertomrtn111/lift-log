'use client'

import { useEffect } from 'react'
import { RotateCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Si una pantalla del coach falla al cargar (por ejemplo, sin conexión con la
 * base de datos), se explica y se puede reintentar sin perder la navegación.
 */
export default function CoachError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error('[coach] error al cargar la pantalla', error)
    }, [error])

    return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
            <div className="max-w-md text-center">
                <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.06]">
                    <WifiOff className="h-5 w-5 text-muted-foreground" />
                </span>
                <p className="nt-eyebrow text-muted-foreground">No se ha podido cargar</p>
                <h1 className="nt-display mt-3 text-[2rem]">Algo ha fallado al traer tus datos.</h1>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                    Suele ser la conexión. Tus datos están a salvo: vuelve a intentarlo en unos segundos.
                </p>
                <Button onClick={reset} className="mt-6">
                    <RotateCw className="h-4 w-4" />
                    Reintentar
                </Button>
                {error.digest && <p className="nt-eyebrow mt-6 text-[10px] text-muted-foreground/70">Referencia {error.digest}</p>}
            </div>
        </div>
    )
}
