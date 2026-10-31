/** Cada pantalla del atleta entra con un fundido corto (desactivado con reduced-motion) */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
    return <div className="client-page-enter">{children}</div>
}
