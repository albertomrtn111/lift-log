export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Cada pantalla de acceso monta su propia estructura con AuthShell
    return <>{children}</>
}
