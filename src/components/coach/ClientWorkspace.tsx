'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Client } from '@/types/coach'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    ClipboardCheck,
    Utensils,
    Dumbbell,
    Timer,
    User
} from 'lucide-react'
import { ReviewsTab } from './tabs/ReviewsTab'
import { DietTab } from './tabs/DietTab'
import { TrainingTab } from './tabs/TrainingTab'
import { RunningTab } from './tabs/RunningTab'

interface ClientWorkspaceProps {
    clients: Pick<Client, 'id' | 'full_name'>[]
    selectedClient: Client | null
    activeTab: string
}

export function ClientWorkspace({ clients, selectedClient, activeTab }: ClientWorkspaceProps) {
    const router = useRouter()
    const [tab, setTab] = useState(activeTab)

    const handleClientChange = (clientId: string) => {
        router.push(`/coach/clients?client=${clientId}&tab=${tab}`)
    }

    const handleTabChange = (newTab: string) => {
        setTab(newTab)
        if (selectedClient) {
            router.push(`/coach/clients?client=${selectedClient.id}&tab=${newTab}`)
        }
    }

    return (
        <div className="space-y-4">
            {/* Client selector */}
            <Card className="p-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>Cliente:</span>
                    </div>
                    <Select
                        value={selectedClient?.id || ''}
                        onValueChange={handleClientChange}
                    >
                        <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Selecciona un cliente" />
                        </SelectTrigger>
                        <SelectContent>
                            {clients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>
                                    {client.full_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </Card>

            {/* Tabs */}
            {selectedClient && (
                <Tabs value={tab} onValueChange={handleTabChange}>
                    <TabsList className="w-full grid grid-cols-4">
                        <TabsTrigger value="reviews" className="gap-2">
                            <ClipboardCheck className="h-4 w-4" />
                            <span className="hidden sm:inline">Revisiones</span>
                        </TabsTrigger>
                        <TabsTrigger value="diet" className="gap-2">
                            <Utensils className="h-4 w-4" />
                            <span className="hidden sm:inline">Dieta</span>
                        </TabsTrigger>
                        <TabsTrigger value="training" className="gap-2">
                            <Dumbbell className="h-4 w-4" />
                            <span className="hidden sm:inline">Entreno</span>
                        </TabsTrigger>
                        <TabsTrigger value="running" className="gap-2">
                            <Timer className="h-4 w-4" />
                            <span className="hidden sm:inline">Running</span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="mt-4">
                        <TabsContent value="reviews">
                            <ReviewsTab clientId={selectedClient.id} />
                        </TabsContent>
                        <TabsContent value="diet">
                            <DietTab clientId={selectedClient.id} />
                        </TabsContent>
                        <TabsContent value="training">
                            <TrainingTab clientId={selectedClient.id} />
                        </TabsContent>
                        <TabsContent value="running">
                            <RunningTab />
                        </TabsContent>
                    </div>
                </Tabs>
            )}
        </div>
    )
}
