import { Suspense } from 'react'
import { getTemplates } from './actions'
import { TemplatesTable } from '@/components/coach/templates/TemplatesTable'
import { CreateTemplateDialog } from '@/components/coach/templates/CreateTemplateDialog'
import { CardioTemplateDialog } from '@/components/coach/templates/CardioTemplateDialog'
import { ImportTemplateDialog } from '@/components/coach/templates/ImportTemplateDialog'
import { Dumbbell, Heart, Plus, Upload } from 'lucide-react'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AITemplateDialog } from '@/components/coach/templates/AITemplateDialog'

export const metadata = {
    title: 'Plantillas de Entrenamiento | NextTrain Coach',
    description: 'Gestiona tus plantillas de entrenamiento reutilizables.',
}

export default async function TemplatesPage() {
    const [strengthTemplates, cardioTemplates] = await Promise.all([
        getTemplates('strength'),
        getTemplates('cardio')
    ])

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            <CoachPageHeader
                eyebrow="Herramientas"
                title="Plantillas"
                description="Rutinas base de fuerza y cardio para reutilizar con tus atletas."
            />

            {/* Content */}
            <main className="px-4 pt-4 lg:px-8 lg:pt-6">
                <Tabs defaultValue="strength" className="w-full">
                    <TabsList className="mb-4 h-10 rounded-full p-1">
                        <TabsTrigger value="strength" className="flex items-center gap-2 rounded-full px-4">
                            <Dumbbell className="h-4 w-4" />
                            Fuerza
                        </TabsTrigger>
                        <TabsTrigger value="cardio" className="flex items-center gap-2 rounded-full px-4">
                            <Heart className="h-4 w-4" />
                            Cardio
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="strength">
                        <div className="mb-4 flex flex-wrap gap-2 sm:justify-end">
                            <AITemplateDialog
                                defaultType="strength"
                                trigger={
                                    <AIActionButton>
                                        Generar con IA
                                    </AIActionButton>
                                }
                            />
                            <ImportTemplateDialog
                                trigger={
                                    <Button variant="outline" className="gap-2">
                                        <Upload className="h-4 w-4" />
                                        CSV
                                    </Button>
                                }
                            />
                            <CreateTemplateDialog
                                defaultType="strength"
                                trigger={
                                    <Button className="gap-1.5 max-sm:flex-1"><Plus className="h-4 w-4" />Nueva rutina</Button>
                                }
                            />
                        </div>
                        <Suspense fallback={<TemplatesTableSkeleton />}>
                            <TemplatesTable templates={strengthTemplates} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="cardio">
                        <div className="mb-4 flex flex-wrap gap-2 sm:justify-end">
                            <AITemplateDialog
                                defaultType="cardio"
                                trigger={
                                    <AIActionButton>
                                        Generar con IA
                                    </AIActionButton>
                                }
                            />
                            <CardioTemplateDialog
                                trigger={
                                    <Button className="gap-1.5 max-sm:flex-1"><Plus className="h-4 w-4" />Nueva sesión</Button>
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
            <div className="rounded-2xl border p-4">
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
