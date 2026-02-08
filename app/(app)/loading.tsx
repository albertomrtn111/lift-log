import { Loader2 } from 'lucide-react'

export default function Loading() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
    )
}
