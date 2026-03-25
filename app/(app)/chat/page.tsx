import { MessageSquare } from 'lucide-react'
import { ClientChat } from '@/components/chat/ClientChat'

export default function ChatPage() {
    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <MessageSquare className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Chat</h1>
                            <p className="text-sm text-muted-foreground">Mensajes con tu entrenador</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 pt-4">
                <ClientChat />
            </div>
        </div>
    )
}
