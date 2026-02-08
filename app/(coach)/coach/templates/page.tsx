import { Suspense } from 'react'
import { getTemplates } from './actions'
import { TemplatesTable } from '@/components/coach/templates/TemplatesTable'
import { CreateTemplateDialog } from '@/components/coach/templates/CreateTemplateDialog'
import { FileText, Dumbbell, Heart, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata = {
    title: 'Plantillas de Entrenamiento | LiftLog Coach',
    description: 'Gestiona tus plantillas de entrenamiento reutilizables.',
}

export default async function TemplatesPage() {
    // Fetch both types in parallel or simple filter if list is small. 
    // Since we are server side, we can just fetch all and filter, or fetch twice.
    // Let's fetch separately to keep logic clean and scalable.
    const [strengthTemplates, cardioTemplates] = await Promise.all([
        getTemplates('strength'),
        getTemplates('cardio')
    ])

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold">Plantillas</h1>
                                <p className="text-sm text-muted-foreground hidden sm:block">
                                    Crea y gestiona tus rutinas base
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="px-4 lg:px-8 pt-6">
                <Tabs defaultValue="strength" className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="strength" className="flex items-center gap-2">
                            <Dumbbell className="h-4 w-4" />
                            Fuerza
                        </TabsTrigger>
                        <TabsTrigger value="cardio" className="flex items-center gap-2">
                            <Heart className="h-4 w-4" />
                            Cardio
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="strength">
                        <div className="mb-6 flex justify-end">
                            <CreateTemplateDialog
                                defaultType="strength"
                                trigger={
                                    <Button>+ Nueva Rutina de Fuerza</Button>
                                }
                            />
                        </div>
                        <Suspense fallback={<TemplatesTableSkeleton />}>
                            <TemplatesTable templates={strengthTemplates} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="cardio">
                        <div className="mb-6 flex justify-end">
                            <CreateTemplateDialog
                                defaultType="cardio"
                                trigger={
                                    <Button>+ Nueva Sesión Cardio</Button>
                                }
                            />
                        </div>
                        <Suspense fallback={<TemplatesTableSkeleton />}>
                            <TemplatesTable templates={cardioTemplates} />
                        </Suspense>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}

function TemplatesTableSkeleton() {
    return (
        <div className="space-y-4">
            <div className="rounded-md border p-4">
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-[250px]" />
                                <Skeleton className="h-3 w-[150px]" />
                            </div>
                            <Skeleton className="h-8 w-8 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
