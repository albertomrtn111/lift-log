import { LogoMark } from '@/components/brand/LogoMark'

/** Carga entre pantallas del atleta: el símbolo de la marca respirando, sin spinners. */
export default function Loading() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status" aria-label="Cargando">
            <LogoMark className="h-9 animate-pulse-soft text-foreground" />
            <p className="nt-eyebrow text-muted-foreground">Cargando</p>
        </div>
    )
}
