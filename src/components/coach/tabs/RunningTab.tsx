'use client'

import { Card } from '@/components/ui/card'
import { Timer } from 'lucide-react'

export function RunningTab() {
    return (
        <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Timer className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Módulo Running</h3>
            <p className="text-muted-foreground">
                Próximamente podrás gestionar planes de carrera para tus clientes.
            </p>
        </Card>
    )
}
