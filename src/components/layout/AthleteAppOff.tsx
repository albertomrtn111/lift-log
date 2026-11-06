/** Lo que ve el atleta si su sala tiene la app apagada. */
export function AthleteAppOff() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
            <div className="max-w-xs space-y-1.5">
                <h1 className="text-lg font-semibold">La app no está activa</h1>
                <p className="text-sm text-muted-foreground">Tu centro no la tiene encendida. Tus informes te seguirán llegando por enlace.</p>
            </div>
            {/* El cierre de sesión es un formulario: funciona aunque no cargue nada más. */}
            <form action="/api/auth/signout" method="post">
                <button type="submit" className="min-h-11 rounded-md border px-4 text-sm font-medium">Cerrar sesión</button>
            </form>
        </div>
    )
}
