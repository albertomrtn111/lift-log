export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-inset-top safe-area-inset-bottom">
            {children}
        </div>
    )
}
