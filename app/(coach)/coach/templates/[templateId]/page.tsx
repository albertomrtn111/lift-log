import { getTemplateById } from '../actions'
import { notFound } from 'next/navigation'
import { StrengthTemplateEditor } from '@/components/coach/templates/StrengthTemplateEditor'
import { CardioSessionBuilder } from '@/components/coach/templates/CardioSessionBuilder'
import { Card } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface TemplateEditorPageProps {
    params: {
        templateId: string
    }
}

export default async function TemplateEditorPage({ params }: TemplateEditorPageProps) {
    const template = await getTemplateById(params.templateId)

    if (!template) {
        notFound()
    }

    return (
        <div className="min-h-screen pb-20 lg:pb-4 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/coach/templates">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold truncate max-w-[300px]">{template.name}</h1>
                            <p className="text-xs text-muted-foreground capitalize">
                                Plantilla de {template.type}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 px-4 lg:px-8 py-6">
                {template.type === 'cardio' ? (
                    <CardioSessionBuilder template={template} />
                ) : (
                    <StrengthTemplateEditor template={template} />
                )}
            </main>
        </div>
    )
}
